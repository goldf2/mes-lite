import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { changeStockLocationBalance, postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import type { ReverseLegacyDailyProductionInput } from '../contracts/legacy-daily-production-schema'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'
import {
  assertLegacyDailyProductionConfirmed,
  assertLegacyDailyProductionDraft,
  roundLegacyDailyProductionQty,
} from '../domain/legacy-daily-production-rules'
import { legacyDailyProductionStatusInclude } from './legacy-daily-production-query-service'
import { runLegacyDailyProductionOperation } from './legacy-daily-production-operation'

const tolerance = 0.000001

type LegacyLayerSnapshot = {
  costLayerId: string
  stockQty: number
  valuationQty: number
  costAmount: number
}

export async function confirmLegacyDailyProductionReport(
  id: string,
  confirmedBy: string,
  confirmedAt = new Date(),
) {
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const report = await tx.dailyProductionReport.findUnique({
      where: { id }, include: legacyDailyProductionStatusInclude,
    })
    if (!report) throw new LegacyDailyProductionError('生产记录不存在', 404)
    assertLegacyDailyProductionDraft(report.status, '确认')
    if (report.consumptions.length === 0) {
      throw new LegacyDailyProductionError('生产记录没有 BOM 原料耗用快照')
    }

    let totalConsumedCost = 0
    for (const line of report.consumptions) {
      const issue = await postInventoryIssue(tx, {
        materialId: line.materialId,
        stockQty: Number(line.actualQty),
        type: 'PRODUCTION_CONSUME',
        refType: 'DAILY_PRODUCTION_REPORT',
        refId: report.id,
        note: `生产记录 ${report.reportNo} 自动耗料`,
        createdBy: confirmedBy,
        idempotencyKey: `DAILY_PRODUCTION:${report.id}:CONSUME:${line.id}`,
        locationId: line.locationId,
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
          costLayerSnapshot: issue.layerConsumptions.length > 0 ? JSON.stringify(issue.layerConsumptions) : null,
        },
      })
      totalConsumedCost = roundLegacyDailyProductionQty(totalConsumedCost + Number(issue.costAmount))
    }

    const outputQty = Number(report.outputQty)
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
        note: `生产记录 ${report.reportNo} 产出入库`,
        createdBy: confirmedBy,
        idempotencyKey: `DAILY_PRODUCTION:${report.id}:OUTPUT`,
        locationId: report.outputLocationId,
      })
      outputValuationQty = Number(receipt.quantities?.valuationQty || 0)
      outputStockUnit = receipt.material?.stockUnit || null
      outputValuationUnit = receipt.material?.valuationUnit || null
      outputConversionRate = Number(receipt.quantities?.conversionRateUsed || 0)
    }

    const result = await tx.dailyProductionReport.update({
      where: { id: report.id },
      data: {
        status: 'CONFIRMED', confirmedAt, confirmedBy, outputValuationQty, outputCostAmount,
        outputStockUnit, outputValuationUnit, outputConversionRate,
        outputConversionSource: 'MASTER_DEFAULT',
      },
      include: legacyDailyProductionStatusInclude,
    })
    return { before: report, result }
  }))
}

async function reverseLegacyOutput(
  tx: Prisma.TransactionClient,
  report: Prisma.DailyProductionReportGetPayload<{ include: typeof legacyDailyProductionStatusInclude }>,
  reason: string,
  reversedBy: string,
) {
  const outputQty = Number(report.outputQty)
  if (outputQty <= 0) return
  const finishedStock = await tx.stock.findUnique({ where: { materialId: report.finishedMaterialId } })
  if (!finishedStock) throw new LegacyDailyProductionError('成品库存记录不存在，无法冲销')
  if (Number(finishedStock.availableQty) + tolerance < outputQty) {
    throw new LegacyDailyProductionError(`成品可用库存不足，无法冲销；当前可用 ${finishedStock.availableQty}，需退回 ${outputQty}`)
  }
  if (Number(finishedStock.totalCost) + tolerance < Number(report.outputCostAmount)) {
    throw new LegacyDailyProductionError('成品库存金额不足，无法冲销；请先检查后续发货或库存调整')
  }
  const outputLayers = await tx.inventoryCostLayer.findMany({
    where: { sourceType: 'DAILY_PRODUCTION_REPORT', sourceId: report.id },
  })
  if (outputLayers.some((layer) => (
    Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) > tolerance
    || Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) > tolerance
  ))) {
    throw new LegacyDailyProductionError('本次生产入库已被后续发货或生产消耗，不能直接冲销')
  }
  await tx.inventoryCostLayer.deleteMany({
    where: { sourceType: 'DAILY_PRODUCTION_REPORT', sourceId: report.id },
  })

  const beforeQty = Number(finishedStock.qty)
  const beforeValuationQty = Number(finishedStock.valuationQty)
  const beforeCost = Number(finishedStock.totalCost)
  const afterQty = roundLegacyDailyProductionQty(beforeQty - outputQty)
  const afterValuationQty = Math.max(0, roundLegacyDailyProductionQty(beforeValuationQty - Number(report.outputValuationQty)))
  const afterCost = Math.max(0, roundLegacyDailyProductionQty(beforeCost - Number(report.outputCostAmount)))
  await tx.stock.update({
    where: { id: finishedStock.id },
    data: {
      qty: afterQty,
      availableQty: roundLegacyDailyProductionQty(Number(finishedStock.availableQty) - outputQty),
      valuationQty: afterValuationQty,
      availableValuationQty: Math.max(0, roundLegacyDailyProductionQty(
        Number(finishedStock.availableValuationQty) - Number(report.outputValuationQty),
      )),
      totalCost: afterCost,
      valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
    },
  })
  const { location: outputLocation } = await changeStockLocationBalance(tx, {
    stockId: finishedStock.id, locationId: report.outputLocationId, qtyDelta: -outputQty,
  })
  const sourceMovement = await tx.stockLog.findFirst({
    where: { refType: 'DAILY_PRODUCTION_REPORT', refId: report.id, type: 'PRODUCTION_IN' },
    orderBy: { createdAt: 'desc' },
  })
  const reversalMovement = await tx.stockLog.create({
    data: {
      stockId: finishedStock.id,
      locationId: outputLocation.id,
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
      stockUnitSnapshot: report.outputStockUnit || report.finishedMaterial.stockUnit || report.finishedMaterial.unit,
      valuationUnitSnapshot: report.outputValuationUnit || report.finishedMaterial.valuationUnit || report.finishedMaterial.unit,
      conversionRateUsed: report.outputConversionRate,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: report.finishedMaterial.costingMethod,
      sourceMovementId: sourceMovement?.id,
      idempotencyKey: `DAILY_PRODUCTION:${report.id}:REVERSE_OUTPUT`,
      refType: 'DAILY_PRODUCTION_REPORT_REVERSE',
      refId: report.id,
      note: `冲销生产记录 ${report.reportNo}: ${reason}`,
      createdBy: reversedBy,
    },
  })
  if (sourceMovement) {
    await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
  }
}

async function restoreLegacyConsumption(
  tx: Prisma.TransactionClient,
  report: Prisma.DailyProductionReportGetPayload<{ include: typeof legacyDailyProductionStatusInclude }>,
  line: Prisma.DailyProductionConsumptionGetPayload<{ include: { material: true } }>,
  reversedBy: string,
) {
  let stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
  if (!stock) stock = await tx.stock.create({ data: { materialId: line.materialId } })
  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCost = Number(stock.totalCost)
  const afterQty = roundLegacyDailyProductionQty(beforeQty + Number(line.actualQty))
  const afterValuationQty = roundLegacyDailyProductionQty(beforeValuationQty + Number(line.valuationQty))
  const afterCost = roundLegacyDailyProductionQty(beforeCost + Number(line.costAmount))
  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundLegacyDailyProductionQty(Number(stock.availableQty) + Number(line.actualQty)),
      valuationQty: afterValuationQty,
      availableValuationQty: roundLegacyDailyProductionQty(Number(stock.availableValuationQty) + Number(line.valuationQty)),
      totalCost: afterCost,
      valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
    },
  })
  const { location: consumptionLocation } = await changeStockLocationBalance(tx, {
    stockId: stock.id, locationId: line.locationId, qtyDelta: Number(line.actualQty),
  })

  const layerSnapshots = line.costLayerSnapshot
    ? JSON.parse(line.costLayerSnapshot) as LegacyLayerSnapshot[]
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

  const sourceMovement = await tx.stockLog.findFirst({
    where: {
      refType: 'DAILY_PRODUCTION_REPORT', refId: report.id, type: 'PRODUCTION_CONSUME',
      stockId: stock.id, locationId: consumptionLocation.id,
    },
    orderBy: { createdAt: 'desc' },
  })
  const reversalMovement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: consumptionLocation.id,
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
      idempotencyKey: `DAILY_PRODUCTION:${report.id}:REVERSE_CONSUME:${line.id}`,
      refType: 'DAILY_PRODUCTION_REPORT_REVERSE',
      refId: report.id,
      note: `冲销生产记录 ${report.reportNo}，恢复原料`,
      createdBy: reversedBy,
    },
  })
  if (sourceMovement) {
    await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
  }
}

export async function reverseLegacyDailyProductionReport(
  id: string,
  input: ReverseLegacyDailyProductionInput,
  reversedBy: string,
  reversedAt = new Date(),
) {
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const report = await tx.dailyProductionReport.findUnique({
      where: { id }, include: legacyDailyProductionStatusInclude,
    })
    if (!report) throw new LegacyDailyProductionError('生产记录不存在', 404)
    assertLegacyDailyProductionConfirmed(report.status)
    await reverseLegacyOutput(tx, report, input.reason, reversedBy)
    for (const line of report.consumptions) await restoreLegacyConsumption(tx, report, line, reversedBy)
    const result = await tx.dailyProductionReport.update({
      where: { id: report.id },
      data: {
        status: 'REVERSED', reversedAt, reversedBy, reverseReason: input.reason,
      },
      include: legacyDailyProductionStatusInclude,
    })
    return { before: report, result }
  }))
}
