import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

const reverseSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
  reversedBy: z.string().trim().optional(),
})

const roundQty = (value: number) => Number(value.toFixed(6))

type LayerSnapshot = {
  costLayerId: string
  stockQty: number
  valuationQty: number
  costAmount: number
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = reverseSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const reversedBy = input.reversedBy || operator?.name || operator?.username || '系统用户'

    const before = await prisma.dailyProductionReport.findUnique({
      where: { id: params.id },
      include: { finishedMaterial: true, consumptions: { include: { material: true } } },
    })
    if (!before) return NextResponse.json({ error: '生产日报不存在' }, { status: 404 })
    if (before.status !== 'CONFIRMED') {
      return NextResponse.json({ error: '只有已确认日报可以冲销' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.dailyProductionReport.findUnique({
        where: { id: before.id },
        include: { finishedMaterial: true, consumptions: { include: { material: true } } },
      })
      if (!report || report.status !== 'CONFIRMED') throw new Error('日报状态已变化，请刷新后重试')

      const outputQty = Number(report.goodQty)
      const finishedStock = await tx.stock.findUnique({ where: { materialId: report.finishedMaterialId } })
      if (outputQty > 0) {
        if (!finishedStock) throw new Error('成品库存记录不存在，无法冲销')
        if (Number(finishedStock.availableQty) + 0.000001 < outputQty) {
          throw new Error(`成品可用库存不足，无法冲销；当前可用 ${finishedStock.availableQty}，需退回 ${outputQty}`)
        }
        if (Number(finishedStock.totalCost) + 0.000001 < Number(report.outputCostAmount)) {
          throw new Error('成品库存金额不足，无法冲销；请先检查后续发货或库存调整')
        }

        const beforeQty = Number(finishedStock.qty)
        const beforeValuationQty = Number(finishedStock.valuationQty)
        const beforeCost = Number(finishedStock.totalCost)
        const afterQty = roundQty(beforeQty - outputQty)
        const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - Number(report.outputValuationQty)))
        const afterCost = Math.max(0, roundQty(beforeCost - Number(report.outputCostAmount)))
        await tx.stock.update({
          where: { id: finishedStock.id },
          data: {
            qty: afterQty,
            availableQty: roundQty(Number(finishedStock.availableQty) - outputQty),
            valuationQty: afterValuationQty,
            availableValuationQty: Math.max(0, roundQty(Number(finishedStock.availableValuationQty) - Number(report.outputValuationQty))),
            totalCost: afterCost,
            valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
            stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
          },
        })
        await tx.stockLog.create({
          data: {
            stockId: finishedStock.id,
            type: 'PRODUCTION_REVERSE_OUT',
            qty: -outputQty,
            beforeQty,
            afterQty,
            valuationQty: -Number(report.outputValuationQty),
            beforeValuationQty,
            afterValuationQty,
            costAmount: -Number(report.outputCostAmount),
            beforeCostAmount: beforeCost,
            afterCostAmount: afterCost,
            refType: 'DAILY_PRODUCTION_REPORT_REVERSE',
            refId: report.id,
            note: `冲销生产日报 ${report.reportNo}: ${input.reason}`,
            createdBy: reversedBy,
          },
        })
      }

      for (const line of report.consumptions) {
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

        const layerSnapshots = line.costLayerSnapshot
          ? JSON.parse(line.costLayerSnapshot) as LayerSnapshot[]
          : []
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

        await tx.stockLog.create({
          data: {
            stockId: stock.id,
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
            refType: 'DAILY_PRODUCTION_REPORT_REVERSE',
            refId: report.id,
            note: `冲销生产日报 ${report.reportNo}，恢复原料`,
            createdBy: reversedBy,
          },
        })
      }

      return tx.dailyProductionReport.update({
        where: { id: report.id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy,
          reverseReason: input.reason,
        },
        include: {
          finishedMaterial: true,
          consumptions: { include: { material: true }, orderBy: { createdAt: 'asc' } },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: before,
      afterData: result,
      note: input.reason,
    })
    return NextResponse.json({ data: result, message: '日报已冲销，原料和成品库存已反向恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: '历史成本层快照损坏，无法自动冲销' }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Reverse daily production report error:', error)
    return NextResponse.json({ error: '冲销生产日报失败' }, { status: 500 })
  }
}
