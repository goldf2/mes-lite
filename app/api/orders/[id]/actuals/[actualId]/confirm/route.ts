import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import { recalculateProductionOrderTotals } from '@/lib/production-order-actual'

const confirmSchema = z.object({ confirmedBy: z.string().trim().optional() })
const roundQty = (value: number) => Number(value.toFixed(6))

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; actualId: string } },
) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const input = confirmSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    const confirmedBy = input.confirmedBy || operator?.name || operator?.username || '系统用户'
    const before = await prisma.productionOrderActual.findFirst({
      where: { id: params.actualId, orderId: params.id },
      include: { inputs: { include: { material: true } }, outputs: { include: { material: true } } },
    })
    if (!before) return NextResponse.json({ error: '班后生产实绩不存在' }, { status: 404 })
    if (before.status !== 'DRAFT') return NextResponse.json({ error: '只有草稿实绩可以确认' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const actual = await tx.productionOrderActual.findFirst({
        where: { id: params.actualId, orderId: params.id },
        include: { inputs: { include: { material: true } }, outputs: { include: { material: true } } },
      })
      if (!actual || actual.status !== 'DRAFT') throw new Error('班后生产实绩状态已变化，请刷新后重试')
      if (actual.inputs.length === 0 || actual.outputs.length === 0) throw new Error('班后生产实绩缺少投入或产出明细')

      let totalConsumedCost = 0
      for (const line of actual.inputs) {
        const issue = await postInventoryIssue(tx, {
          materialId: line.materialId,
          stockQty: Number(line.actualQty),
          type: 'PRODUCTION_CONSUME',
          refType: 'PRODUCTION_ORDER_ACTUAL',
          refId: actual.id,
          note: `生产订单实绩 ${actual.actualNo} 投入出库`,
          createdBy: confirmedBy,
          idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:INPUT:${line.id}`,
          locationId: line.locationId,
        })
        await tx.productionOrderActualInput.update({
          where: { id: line.id },
          data: {
            valuationQty: issue.valuationQty,
            valuationUnit: issue.material?.valuationUnit,
            costAmount: issue.costAmount,
            conversionRateUsed: issue.conversionRateUsed,
            conversionSource: issue.conversionSource,
            costingMethod: line.material.costingMethod,
            costLayerSnapshot: issue.layerConsumptions.length > 0 ? JSON.stringify(issue.layerConsumptions) : null,
          },
        })
        totalConsumedCost = roundQty(totalConsumedCost + Number(issue.costAmount))
      }

      for (const line of actual.outputs) {
        if (Number(line.actualQty) <= 0) continue
        const costAmount = line.isPrimary ? totalConsumedCost : 0
        const receipt = await postInventoryReceipt(tx, {
          materialId: line.materialId,
          stockQty: Number(line.actualQty),
          conversionSource: 'MASTER_DEFAULT',
          costAmount,
          type: 'PRODUCTION_IN',
          refType: 'PRODUCTION_ORDER_ACTUAL',
          refId: actual.id,
          note: `生产订单实绩 ${actual.actualNo} 产出入库`,
          createdBy: confirmedBy,
          idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:OUTPUT:${line.id}`,
          locationId: line.locationId,
        })
        await tx.productionOrderActualOutput.update({
          where: { id: line.id },
          data: {
            valuationQty: Number(receipt.quantities?.valuationQty || 0),
            costAmount,
            stockUnit: receipt.material?.stockUnit,
            valuationUnit: receipt.material?.valuationUnit,
            conversionRateUsed: Number(receipt.quantities?.conversionRateUsed || 0),
            conversionSource: receipt.quantities?.conversionSource || 'MASTER_DEFAULT',
          },
        })
      }

      const updated = await tx.productionOrderActual.update({
        where: { id: actual.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy },
        include: { inputs: true, outputs: true },
      })
      await recalculateProductionOrderTotals(tx, actual.orderId)
      return updated
    })

    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'PRODUCTION_ORDER_ACTUAL',
      entityId: result.id,
      entityLabel: result.actualNo,
      beforeData: before,
      afterData: result,
      note: '确认班后生产实绩并原子更新投入、全部产出和生产订单累计数量',
    })
    return NextResponse.json({ data: result, message: '班后生产实绩已确认，投入和全部产出库存已同步更新' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '确认班后生产实绩失败' }, { status: 500 })
  }
}
