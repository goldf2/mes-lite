import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'

const confirmSchema = z.object({
  confirmedBy: z.string().trim().optional(),
})

const roundQty = (value: number) => Number(value.toFixed(6))

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = confirmSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    const confirmedBy = input.confirmedBy || operator?.name || operator?.username || '系统用户'

    const before = await prisma.dailyProductionReport.findUnique({
      where: { id: params.id },
      include: { finishedMaterial: true, consumptions: { include: { material: true } } },
    })
    if (!before) return NextResponse.json({ error: '生产日报不存在' }, { status: 404 })
    if (before.status !== 'DRAFT') {
      return NextResponse.json({ error: '只有草稿日报可以确认' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.dailyProductionReport.findUnique({
        where: { id: before.id },
        include: { finishedMaterial: true, consumptions: { include: { material: true } } },
      })
      if (!report || report.status !== 'DRAFT') throw new Error('日报状态已变化，请刷新后重试')
      if (report.consumptions.length === 0) throw new Error('日报没有 BOM 原料消耗快照')

      let totalConsumedCost = 0

      for (const line of report.consumptions) {
        const issue = await postInventoryIssue(tx, {
          materialId: line.materialId,
          stockQty: Number(line.actualQty),
          type: 'PRODUCTION_CONSUME',
          refType: 'DAILY_PRODUCTION_REPORT',
          refId: report.id,
          note: `生产日报 ${report.reportNo} 自动耗料`,
          createdBy: confirmedBy,
          idempotencyKey: `DAILY_PRODUCTION:${report.id}:CONSUME:${line.id}`,
        })
        await tx.dailyProductionConsumption.update({
          where: { id: line.id },
          data: {
            valuationQty: issue.valuationQty,
            valuationUnit: issue.material?.valuationUnit,
            costAmount: issue.costAmount,
            conversionRateUsed: issue.conversionRateUsed,
            conversionSource: issue.conversionSource,
            costingMethod: line.material.costingMethod,
            costLayerSnapshot: issue.layerConsumptions.length > 0
              ? JSON.stringify(issue.layerConsumptions)
              : null,
          },
        })
        totalConsumedCost = roundQty(totalConsumedCost + Number(issue.costAmount))
      }

      const outputQty = Number(report.goodQty)
      const outputCostAmount = outputQty > 0 ? totalConsumedCost : 0
      let outputValuationQty = 0
      let outputStockUnit: string | null = null
      let outputValuationUnit: string | null = null
      let outputConversionRate: number | null = null
      if (outputQty > 0) {
        const receipt = await postInventoryReceipt(tx, {
          materialId: report.finishedMaterialId,
          stockQty: outputQty,
          conversionSource: 'MASTER_DEFAULT',
          costAmount: outputCostAmount,
          type: 'PRODUCTION_IN',
          refType: 'DAILY_PRODUCTION_REPORT',
          refId: report.id,
          note: `生产日报 ${report.reportNo} 合格品入库`,
          createdBy: confirmedBy,
          idempotencyKey: `DAILY_PRODUCTION:${report.id}:OUTPUT`,
        })
        outputValuationQty = Number(receipt.quantities?.valuationQty || 0)
        outputStockUnit = receipt.material?.stockUnit || null
        outputValuationUnit = receipt.material?.valuationUnit || null
        outputConversionRate = Number(receipt.quantities?.conversionRateUsed || 0)
      }

      return tx.dailyProductionReport.update({
        where: { id: report.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy,
          outputValuationQty,
          outputCostAmount,
          outputStockUnit,
          outputValuationUnit,
          outputConversionRate,
          outputConversionSource: 'MASTER_DEFAULT',
        },
        include: {
          finishedMaterial: true,
          consumptions: { include: { material: true }, orderBy: { createdAt: 'asc' } },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: before,
      afterData: result,
      note: '自动扣减 BOM 原料并增加合格成品库存',
    })
    return NextResponse.json({ data: result, message: '日报已确认，原料和成品库存已同步更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Confirm daily production report error:', error)
    return NextResponse.json({ error: '确认生产日报失败' }, { status: 500 })
  }
}
