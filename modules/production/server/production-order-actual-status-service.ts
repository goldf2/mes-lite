import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { changeStockLocationBalance, postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import { parseProductionActualCostLayerSnapshot } from '../domain/production-order-actual-cost-snapshot'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { recalculateProductionOrderTotals } from './production-order-actual-totals'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001

const postingInclude = {
  inputs: { include: { material: true } },
  outputs: { include: { material: true } },
} satisfies Prisma.ProductionOrderActualInclude

async function requireProductionOrderActual(
  tx: Prisma.TransactionClient,
  orderId: string,
  actualId: string,
  expectedStatus: 'DRAFT' | 'CONFIRMED',
) {
  const actual = await tx.productionOrderActual.findFirst({
    where: { id: actualId, orderId },
    include: postingInclude,
  })
  if (!actual) throw new ProductionOrderDomainError('班后生产实绩不存在', 404)
  if (actual.status !== expectedStatus) {
    throw new ProductionOrderDomainError(
      expectedStatus === 'DRAFT' ? '只有草稿实绩可以确认' : '只有已确认实绩可以冲销',
    )
  }
  return actual
}

export async function confirmProductionOrderActual(orderId: string, actualId: string, confirmedBy: string) {
  return prisma.$transaction(async (tx) => {
    const actual = await requireProductionOrderActual(tx, orderId, actualId, 'DRAFT')
    if (actual.inputs.length === 0 || actual.outputs.length === 0) {
      throw new ProductionOrderDomainError('班后生产实绩缺少投入或产出明细')
    }

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
      include: postingInclude,
    })
    await recalculateProductionOrderTotals(tx, actual.orderId)
    return { before: actual, updated }
  })
}

async function reverseProductionOutput(
  tx: Prisma.TransactionClient,
  actual: Prisma.ProductionOrderActualGetPayload<{ include: typeof postingInclude }>,
  line: Prisma.ProductionOrderActualOutputGetPayload<{ include: { material: true } }>,
  reason: string,
  reversedBy: string,
) {
  const outputQty = Number(line.actualQty)
  if (outputQty <= 0) return
  const stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
  if (!stock) throw new ProductionOrderDomainError(`产出 ${line.materialCode} 没有库存记录，无法冲销`)
  if (Number(stock.availableQty) + tolerance < outputQty) {
    throw new ProductionOrderDomainError(`产出 ${line.materialCode} 可用库存不足，无法冲销`)
  }
  if (Number(stock.totalCost) + tolerance < Number(line.costAmount)) {
    throw new ProductionOrderDomainError(`产出 ${line.materialCode} 库存金额不足，无法冲销`)
  }

  const outputLayers = await tx.inventoryCostLayer.findMany({
    where: { sourceType: 'PRODUCTION_ORDER_ACTUAL', sourceId: actual.id, materialId: line.materialId },
  })
  if (outputLayers.some((layer) =>
    Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) > tolerance
    || Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) > tolerance
  )) {
    throw new ProductionOrderDomainError(`产出 ${line.materialCode} 已被后续领用或发货，不能直接冲销`)
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
      note: `冲销生产订单实绩 ${actual.actualNo}: ${reason}`,
      createdBy: reversedBy,
    },
  })
  if (sourceMovement) {
    await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
  }
}

async function restoreProductionInput(
  tx: Prisma.TransactionClient,
  actual: Prisma.ProductionOrderActualGetPayload<{ include: typeof postingInclude }>,
  line: Prisma.ProductionOrderActualInputGetPayload<{ include: { material: true } }>,
  reversedBy: string,
) {
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
  for (const layer of parseProductionActualCostLayerSnapshot(line.costLayerSnapshot)) {
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

export async function reverseProductionOrderActual(
  orderId: string,
  actualId: string,
  input: { reason: string },
  reversedBy: string,
) {
  return prisma.$transaction(async (tx) => {
    const actual = await requireProductionOrderActual(tx, orderId, actualId, 'CONFIRMED')
    for (const line of actual.outputs) await reverseProductionOutput(tx, actual, line, input.reason, reversedBy)
    for (const line of actual.inputs) await restoreProductionInput(tx, actual, line, reversedBy)

    const updated = await tx.productionOrderActual.update({
      where: { id: actual.id },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversedBy,
        reverseReason: input.reason,
      },
      include: postingInclude,
    })
    await recalculateProductionOrderTotals(tx, actual.orderId)
    return { before: actual, updated }
  })
}
