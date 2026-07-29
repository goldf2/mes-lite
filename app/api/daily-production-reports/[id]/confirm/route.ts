import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { consumeMaterialCost } from '@/lib/costing'
import { toValuationQty } from '@/lib/units'
import { writeAuditLog } from '@/lib/audit'

const confirmSchema = z.object({
  confirmedBy: z.string().trim().optional(),
})

const roundQty = (value: number) => Number(value.toFixed(6))

async function ensureFifoLayers(
  tx: Prisma.TransactionClient,
  material: {
    id: string
    stockUnit: string
    valuationUnit: string
  },
  stock: {
    qty: number
    valuationQty: number
    totalCost: number
    stockUnitCost: number
    valuationUnitCost: number
  },
) {
  const openLayers = await tx.inventoryCostLayer.aggregate({
    where: { materialId: material.id, status: 'OPEN', remainingStockQty: { gt: 0 } },
    _sum: {
      remainingStockQty: true,
      remainingValuationQty: true,
      remainingAmount: true,
    },
  })
  const layeredStockQty = Number(openLayers._sum.remainingStockQty || 0)
  const missingStockQty = roundQty(Number(stock.qty) - layeredStockQty)
  if (missingStockQty <= 0.000001) return

  const stockToValuationRate = Number(stock.qty) > 0 ? Number(stock.valuationQty) / Number(stock.qty) : 1
  const valuationQty = roundQty(missingStockQty * stockToValuationRate)
  const stockUnitCost = Number(stock.qty) > 0 ? Number(stock.totalCost) / Number(stock.qty) : Number(stock.stockUnitCost)
  const amount = roundQty(missingStockQty * stockUnitCost)

  await tx.inventoryCostLayer.create({
    data: {
      materialId: material.id,
      stockQty: missingStockQty,
      remainingStockQty: missingStockQty,
      valuationQty,
      remainingValuationQty: valuationQty,
      stockUnit: material.stockUnit,
      valuationUnit: material.valuationUnit,
      valuationUnitCost: valuationQty > 0 ? amount / valuationQty : Number(stock.valuationUnitCost),
      stockUnitCost,
      totalAmount: amount,
      remainingAmount: amount,
      status: 'OPEN',
    },
  })
}

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
        const issueQty = Number(line.actualQty)
        const stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
        if (!stock) throw new Error(`原料 ${line.materialCode} ${line.materialName} 没有库存记录`)
        if (Number(stock.availableQty) + 0.000001 < issueQty) {
          throw new Error(`原料 ${line.materialCode} ${line.materialName} 库存不足：可用 ${stock.availableQty} ${line.unit}，需 ${issueQty} ${line.unit}`)
        }

        if (line.material.costingMethod === 'FIFO') {
          await ensureFifoLayers(tx, {
            id: line.material.id,
            stockUnit: line.material.stockUnit || line.material.unit,
            valuationUnit: line.material.valuationUnit || line.material.unit,
          }, {
            qty: Number(stock.qty),
            valuationQty: Number(stock.valuationQty),
            totalCost: Number(stock.totalCost),
            stockUnitCost: Number(stock.stockUnitCost),
            valuationUnitCost: Number(stock.valuationUnitCost),
          })
        }

        const costResult = await consumeMaterialCost(tx, {
          materialId: line.materialId,
          issueStockQty: issueQty,
          stock: {
            id: stock.id,
            qty: Number(stock.qty),
            valuationQty: Number(stock.valuationQty),
            totalCost: Number(stock.totalCost),
            valuationUnitCost: Number(stock.valuationUnitCost),
          },
          material: {
            costingMethod: line.material.costingMethod,
            conversionRate: Number(line.material.conversionRate),
          },
        })
        const beforeQty = Number(stock.qty)
        const beforeValuationQty = Number(stock.valuationQty)
        const beforeCostAmount = Number(stock.totalCost)
        const afterQty = roundQty(beforeQty - issueQty)
        const afterValuationQty = roundQty(beforeValuationQty - costResult.issueValuationQty)
        const afterCostAmount = Math.max(0, roundQty(beforeCostAmount - costResult.costAmount))
        const valuationUnitCost = afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0
        const stockUnitCost = afterQty > 0 ? afterCostAmount / afterQty : 0

        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: afterQty,
            availableQty: roundQty(Number(stock.availableQty) - issueQty),
            valuationQty: afterValuationQty,
            availableValuationQty: roundQty(Number(stock.availableValuationQty) - costResult.issueValuationQty),
            totalCost: afterCostAmount,
            valuationUnitCost: Math.max(0, valuationUnitCost),
            stockUnitCost: Math.max(0, stockUnitCost),
          },
        })
        await tx.stockLog.create({
          data: {
            stockId: stock.id,
            type: 'PRODUCTION_CONSUME',
            qty: -issueQty,
            beforeQty,
            afterQty,
            valuationQty: -costResult.issueValuationQty,
            beforeValuationQty,
            afterValuationQty,
            costAmount: -costResult.costAmount,
            beforeCostAmount,
            afterCostAmount,
            refType: 'DAILY_PRODUCTION_REPORT',
            refId: report.id,
            note: `生产日报 ${report.reportNo} 自动耗料`,
            createdBy: confirmedBy,
          },
        })
        await tx.dailyProductionConsumption.update({
          where: { id: line.id },
          data: {
            valuationQty: costResult.issueValuationQty,
            costAmount: costResult.costAmount,
            conversionRateUsed: costResult.conversionRateUsed,
            costingMethod: line.material.costingMethod,
            costLayerSnapshot: costResult.layerConsumptions.length > 0
              ? JSON.stringify(costResult.layerConsumptions)
              : null,
          },
        })
        totalConsumedCost = roundQty(totalConsumedCost + costResult.costAmount)
      }

      let finishedStock = await tx.stock.findUnique({ where: { materialId: report.finishedMaterialId } })
      if (!finishedStock) {
        finishedStock = await tx.stock.create({ data: { materialId: report.finishedMaterialId } })
      }
      const outputQty = Number(report.goodQty)
      const outputValuationQty = outputQty > 0
        ? toValuationQty(outputQty, Number(report.finishedMaterial.conversionRate))
        : 0
      const outputCostAmount = outputQty > 0 ? totalConsumedCost : 0
      const beforeOutputQty = Number(finishedStock.qty)
      const beforeOutputValuationQty = Number(finishedStock.valuationQty)
      const beforeOutputCost = Number(finishedStock.totalCost)
      const afterOutputQty = roundQty(beforeOutputQty + outputQty)
      const afterOutputValuationQty = roundQty(beforeOutputValuationQty + outputValuationQty)
      const afterOutputCost = roundQty(beforeOutputCost + outputCostAmount)

      if (outputQty > 0) {
        await tx.stock.update({
          where: { id: finishedStock.id },
          data: {
            qty: afterOutputQty,
            availableQty: roundQty(Number(finishedStock.availableQty) + outputQty),
            valuationQty: afterOutputValuationQty,
            availableValuationQty: roundQty(Number(finishedStock.availableValuationQty) + outputValuationQty),
            totalCost: afterOutputCost,
            valuationUnitCost: afterOutputValuationQty > 0 ? afterOutputCost / afterOutputValuationQty : 0,
            stockUnitCost: afterOutputQty > 0 ? afterOutputCost / afterOutputQty : 0,
          },
        })
        await tx.stockLog.create({
          data: {
            stockId: finishedStock.id,
            type: 'PRODUCTION_IN',
            qty: outputQty,
            beforeQty: beforeOutputQty,
            afterQty: afterOutputQty,
            valuationQty: outputValuationQty,
            beforeValuationQty: beforeOutputValuationQty,
            afterValuationQty: afterOutputValuationQty,
            costAmount: outputCostAmount,
            beforeCostAmount: beforeOutputCost,
            afterCostAmount: afterOutputCost,
            refType: 'DAILY_PRODUCTION_REPORT',
            refId: report.id,
            note: `生产日报 ${report.reportNo} 合格品入库`,
            createdBy: confirmedBy,
          },
        })
      }

      return tx.dailyProductionReport.update({
        where: { id: report.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy,
          outputValuationQty,
          outputCostAmount,
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
