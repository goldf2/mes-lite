import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { z } from 'zod'

const reverseSchema = z.object({
  reason: z.string().min(1, '红冲原因必填'),
  reversedBy: z.string().optional(),
})

function closeEnough(a: number, b: number) {
  return Math.abs(a - b) <= 0.000001
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied

    const body = await req.json()
    const { reason, reversedBy } = reverseSchema.parse(body)

    const materialIn = await prisma.materialIn.findUnique({
      where: { id: params.id },
      include: { material: true, supplier: true },
    })

    if (!materialIn || materialIn.deletedAt) {
      return NextResponse.json({ error: '来料单不存在或已归档' }, { status: 404 })
    }

    if (materialIn.status !== 'RECEIVED') {
      return NextResponse.json({ error: '只有已收货来料单可以红冲' }, { status: 400 })
    }

    const qty = Number(materialIn.qty)
    const valuationQty = Number(materialIn.valuationQty)
    const costAmount = Number(materialIn.totalAmount)

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({ where: { materialId: materialIn.materialId } })
      if (!stock) throw new Error('库存记录不存在，无法红冲')

      const layer = await tx.inventoryCostLayer.findFirst({
        where: { materialInId: materialIn.id },
      })

      if (layer) {
        const consumedCount = await tx.costLayerConsumption.count({
          where: { costLayerId: layer.id, restoredAt: null },
        })
        const layerUntouched =
          closeEnough(Number(layer.remainingStockQty), Number(layer.stockQty)) &&
          closeEnough(Number(layer.remainingValuationQty), Number(layer.valuationQty)) &&
          closeEnough(Number(layer.remainingAmount ?? layer.totalAmount), Number(layer.totalAmount)) &&
          consumedCount === 0

        if (!layerUntouched) {
          throw new Error('该来料批次已被领料或成本层已变动，不能直接红冲，请先退料或做存货调整')
        }
      }

      const beforeQty = Number(stock.qty)
      const beforeAvailableQty = Number(stock.availableQty)
      const beforeValuationQty = Number(stock.valuationQty)
      const beforeAvailableValuationQty = Number(stock.availableValuationQty)
      const beforeCostAmount = Number(stock.totalCost)

      if (beforeAvailableQty < qty || beforeAvailableValuationQty < valuationQty) {
        throw new Error('可用库存不足，不能红冲该来料单')
      }
      if (layer && beforeCostAmount < costAmount) {
        throw new Error('库存金额不足，不能红冲该来料单')
      }

      const reverseCostAmount = layer ? costAmount : Math.min(costAmount, Math.max(0, beforeCostAmount))
      const afterQty = Number((beforeQty - qty).toFixed(6))
      const afterValuationQty = Number((beforeValuationQty - valuationQty).toFixed(6))
      const afterCostAmount = Number(Math.max(0, beforeCostAmount - reverseCostAmount).toFixed(6))
      const valuationUnitCost = afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0
      const stockUnitCost = afterQty > 0 ? afterCostAmount / afterQty : 0

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { decrement: qty },
          availableQty: { decrement: qty },
          valuationQty: { decrement: valuationQty },
          availableValuationQty: { decrement: valuationQty },
          totalCost: { decrement: reverseCostAmount },
          valuationUnitCost: Math.max(0, valuationUnitCost),
          stockUnitCost: Math.max(0, stockUnitCost),
        },
      })

      if (layer) {
        await tx.inventoryCostLayer.update({
          where: { id: layer.id },
          data: {
            remainingStockQty: 0,
            remainingValuationQty: 0,
            remainingAmount: 0,
            status: 'REVERSED',
          },
        })
      } else {
        await tx.inventoryCostLayer.create({
          data: {
            materialId: materialIn.materialId,
            materialInId: materialIn.id,
            stockQty: qty,
            remainingStockQty: 0,
            valuationQty,
            remainingValuationQty: 0,
            stockUnit: materialIn.unit,
            valuationUnit: materialIn.valuationUnit,
            valuationUnitCost: Number(materialIn.valuationUnitCost || (valuationQty > 0 ? costAmount / valuationQty : 0)),
            stockUnitCost: Number(materialIn.stockUnitCost || (qty > 0 ? costAmount / qty : 0)),
            totalAmount: costAmount,
            remainingAmount: 0,
            status: 'REVERSED',
          },
        })
      }

      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          type: 'REVERSE_IN',
          qty: -qty,
          beforeQty,
          afterQty,
          valuationQty: -valuationQty,
          beforeValuationQty,
          afterValuationQty,
          costAmount: -reverseCostAmount,
          beforeCostAmount,
          afterCostAmount,
          refType: 'MATERIAL_IN_REVERSE',
          refId: materialIn.id,
          note: `红冲来料单 ${materialIn.inboundNo}: ${reason}`,
          createdBy: reversedBy,
        },
      })

      return tx.materialIn.update({
        where: { id: materialIn.id },
        data: {
          status: 'REVERSED',
          note: materialIn.note ? `${materialIn.note}\n红冲原因：${reason}` : `红冲原因：${reason}`,
        },
        include: { material: true, supplier: true },
      })
    })

    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'MATERIAL_IN',
      entityId: result.id,
      entityLabel: result.inboundNo,
      beforeData: materialIn,
      afterData: result,
      note: reason,
    })

    return NextResponse.json({ data: result, message: '来料单已红冲' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Reverse material-in error:', error)
    return NextResponse.json({ error: '来料单红冲失败' }, { status: 500 })
  }
}
