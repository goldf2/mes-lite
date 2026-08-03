import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { changeStockLocationBalance } from '@/lib/inventory'
import { recalculateProductionOrderTotals } from '@/lib/production-order-actual'

const reverseSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
  reversedBy: z.string().trim().optional(),
})

const roundQty = (value: number) => Number(value.toFixed(6))
type LayerSnapshot = { costLayerId: string; stockQty: number; valuationQty: number; costAmount: number }

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; actualId: string } },
) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const input = reverseSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const reversedBy = input.reversedBy || operator?.name || operator?.username || '系统用户'
    const before = await prisma.productionOrderActual.findFirst({
      where: { id: params.actualId, orderId: params.id },
      include: { inputs: { include: { material: true } }, outputs: { include: { material: true } } },
    })
    if (!before) return NextResponse.json({ error: '班后生产实绩不存在' }, { status: 404 })
    if (before.status !== 'CONFIRMED') return NextResponse.json({ error: '只有已确认实绩可以冲销' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const actual = await tx.productionOrderActual.findFirst({
        where: { id: params.actualId, orderId: params.id },
        include: { inputs: { include: { material: true } }, outputs: { include: { material: true } } },
      })
      if (!actual || actual.status !== 'CONFIRMED') throw new Error('班后生产实绩状态已变化，请刷新后重试')

      for (const line of actual.outputs) {
        const outputQty = Number(line.actualQty)
        if (outputQty <= 0) continue
        const stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
        if (!stock) throw new Error(`产出 ${line.materialCode} 没有库存记录，无法冲销`)
        if (Number(stock.availableQty) + 0.000001 < outputQty) {
          throw new Error(`产出 ${line.materialCode} 可用库存不足，无法冲销`)
        }
        if (Number(stock.totalCost) + 0.000001 < Number(line.costAmount)) {
          throw new Error(`产出 ${line.materialCode} 库存金额不足，无法冲销`)
        }
        const outputLayers = await tx.inventoryCostLayer.findMany({
          where: { sourceType: 'PRODUCTION_ORDER_ACTUAL', sourceId: actual.id, materialId: line.materialId },
        })
        if (outputLayers.some((layer) =>
          Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) > 0.000001
          || Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) > 0.000001
        )) {
          throw new Error(`产出 ${line.materialCode} 已被后续领用或发货，不能直接冲销`)
        }
        await tx.inventoryCostLayer.deleteMany({
          where: { sourceType: 'PRODUCTION_ORDER_ACTUAL', sourceId: actual.id, materialId: line.materialId },
        })

        const beforeQty = Number(stock.qty)
        const beforeValuationQty = Number(stock.valuationQty)
        const beforeCost = Number(stock.totalCost)
        const afterQty = roundQty(beforeQty - outputQty)
        const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - Number(line.valuationQty)))
        const afterCost = Math.max(0, roundQty(beforeCost - Number(line.costAmount)))
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: afterQty,
            availableQty: roundQty(Number(stock.availableQty) - outputQty),
            valuationQty: afterValuationQty,
            availableValuationQty: Math.max(0, roundQty(Number(stock.availableValuationQty) - Number(line.valuationQty))),
            totalCost: afterCost,
            valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
            stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
          },
        })
        const { location } = await changeStockLocationBalance(tx, {
          stockId: stock.id,
          locationId: line.locationId,
          qtyDelta: -outputQty,
        })
        const sourceMovement = await tx.stockLog.findFirst({
          where: { refType: 'PRODUCTION_ORDER_ACTUAL', refId: actual.id, type: 'PRODUCTION_IN', stockId: stock.id, locationId: location.id },
          orderBy: { createdAt: 'desc' },
        })
        const reversalMovement = await tx.stockLog.create({
          data: {
            stockId: stock.id,
            locationId: location.id,
            type: 'PRODUCTION_REVERSE_OUT',
            qty: -outputQty,
            beforeQty,
            afterQty,
            valuationQty: -Number(line.valuationQty),
            beforeValuationQty,
            afterValuationQty,
            costAmount: -Number(line.costAmount),
            beforeCostAmount: beforeCost,
            afterCostAmount: afterCost,
            stockUnitSnapshot: line.stockUnit || line.material.stockUnit || line.material.unit,
            valuationUnitSnapshot: line.valuationUnit || line.material.valuationUnit || line.material.unit,
            conversionRateUsed: line.conversionRateUsed,
            conversionSource: 'ORIGINAL_MOVEMENT',
            costingMethodSnapshot: line.material.costingMethod,
            sourceMovementId: sourceMovement?.id,
            idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:REVERSE_OUTPUT:${line.id}`,
            refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE',
            refId: actual.id,
            note: `冲销生产订单实绩 ${actual.actualNo}: ${input.reason}`,
            createdBy: reversedBy,
          },
        })
        if (sourceMovement) {
          await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
        }
      }

      for (const line of actual.inputs) {
        let stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
        if (!stock) stock = await tx.stock.create({ data: { materialId: line.materialId } })
        const beforeQty = Number(stock.qty)
        const beforeValuationQty = Number(stock.valuationQty)
        const beforeCost = Number(stock.totalCost)
        const afterQty = roundQty(beforeQty + Number(line.actualQty))
        const afterValuationQty = roundQty(beforeValuationQty + Number(line.valuationQty))
        const afterCost = roundQty(beforeCost + Number(line.costAmount))
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: afterQty,
            availableQty: roundQty(Number(stock.availableQty) + Number(line.actualQty)),
            valuationQty: afterValuationQty,
            availableValuationQty: roundQty(Number(stock.availableValuationQty) + Number(line.valuationQty)),
            totalCost: afterCost,
            valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
            stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
          },
        })
        const { location } = await changeStockLocationBalance(tx, {
          stockId: stock.id,
          locationId: line.locationId,
          qtyDelta: Number(line.actualQty),
        })
        const layerSnapshots = line.costLayerSnapshot ? JSON.parse(line.costLayerSnapshot) as LayerSnapshot[] : []
        for (const layer of layerSnapshots) {
          await tx.inventoryCostLayer.update({
            where: { id: layer.costLayerId },
            data: {
              remainingStockQty: { increment: Number(layer.stockQty) },
              remainingValuationQty: { increment: Number(layer.valuationQty) },
              remainingAmount: { increment: Number(layer.costAmount) },
              status: 'OPEN',
            },
          })
        }
        const sourceMovement = await tx.stockLog.findFirst({
          where: { refType: 'PRODUCTION_ORDER_ACTUAL', refId: actual.id, type: 'PRODUCTION_CONSUME', stockId: stock.id, locationId: location.id },
          orderBy: { createdAt: 'desc' },
        })
        const reversalMovement = await tx.stockLog.create({
          data: {
            stockId: stock.id,
            locationId: location.id,
            type: 'PRODUCTION_REVERSE_CONSUME',
            qty: Number(line.actualQty),
            beforeQty,
            afterQty,
            valuationQty: Number(line.valuationQty),
            beforeValuationQty,
            afterValuationQty,
            costAmount: Number(line.costAmount),
            beforeCostAmount: beforeCost,
            afterCostAmount: afterCost,
            stockUnitSnapshot: line.unit,
            valuationUnitSnapshot: line.valuationUnit || line.material.valuationUnit || line.material.unit,
            conversionRateUsed: line.conversionRateUsed,
            conversionSource: 'ORIGINAL_MOVEMENT',
            costingMethodSnapshot: line.costingMethod,
            sourceMovementId: sourceMovement?.id,
            idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:REVERSE_INPUT:${line.id}`,
            refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE',
            refId: actual.id,
            note: `冲销生产订单实绩 ${actual.actualNo}，恢复投入物料`,
            createdBy: reversedBy,
          },
        })
        if (sourceMovement) {
          await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
        }
      }

      const updated = await tx.productionOrderActual.update({
        where: { id: actual.id },
        data: { status: 'REVERSED', reversedAt: new Date(), reversedBy, reverseReason: input.reason },
        include: { inputs: true, outputs: true },
      })
      await recalculateProductionOrderTotals(tx, actual.orderId)
      return updated
    })

    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'PRODUCTION_ORDER_ACTUAL',
      entityId: result.id,
      entityLabel: result.actualNo,
      beforeData: before,
      afterData: result,
      note: input.reason,
    })
    return NextResponse.json({ data: result, message: '班后生产实绩已冲销，投入与全部产出库存已反向恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: '历史成本层快照损坏，无法自动冲销' }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '冲销班后生产实绩失败' }, { status: 500 })
  }
}
