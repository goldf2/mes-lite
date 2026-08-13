import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  assertInventoryLocationDataScope,
  assertProductionActualDataScope,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { changeStockLocationBalance, postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import {
  allocateAvailableInventoryLots,
  createInventoryLotReceipt,
  createProductionLotGenealogies,
  reverseProductionLotAllocations,
} from '@/modules/inventory'
import { createProductionQualityInspection } from '@/modules/quality'
import { parseProductionActualCostLayerSnapshot } from '../domain/production-order-actual-cost-snapshot'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { recalculateProductionOrderTotals } from './production-order-actual-totals'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001

const postingInclude = {
  employees: { select: { employeeId: true } },
  order: {
    include: {
      dispatches: { where: { deletedAt: null }, select: { employeeId: true, step: { select: { workCenterId: true } } } },
      product: {
        select: {
          processRoutes: {
            where: { isDefault: true },
            select: { steps: { where: { deletedAt: null }, select: { workCenterId: true } } },
          },
        },
      },
    },
  },
  inputs: {
    include: {
      material: true,
      lotAllocations: {
        include: { lot: true, location: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  outputs: {
    include: {
      material: true,
      inventoryLot: {
        include: {
          balances: true,
          inspections: true,
          childGenealogies: {
            where: { status: 'ACTIVE' },
            include: { parentLot: true, inputAllocation: { include: { actualInput: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
        },
      },
    },
  },
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

export async function confirmProductionOrderActual(orderId: string, actualId: string, confirmedBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return prisma.$transaction(async (tx) => {
    const actual = await requireProductionOrderActual(tx, orderId, actualId, 'DRAFT')
    assertProductionActualDataScope(scope, actual)
    assertInventoryLocationDataScope(scope, [...actual.inputs.map((line) => line.locationId), ...actual.outputs.map((line) => line.locationId)])
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
      await allocateAvailableInventoryLots(tx, {
        actualInputId: line.id,
        materialId: line.materialId,
        materialCode: line.materialCode,
        locationId: line.locationId,
        locationCode: issue.location!.code,
        stockQty: Number(line.actualQty),
        issueValuationQty: Number(issue.valuationQty),
        issueCostAmount: Number(issue.costAmount),
        stockLogId: issue.movement!.id,
        createdBy: confirmedBy,
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
        inventoryStatus: 'QUARANTINE',
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `${actual.actualNo}-${line.materialCode}`,
        materialId: line.materialId,
        productionOutputId: line.id,
        sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT',
        sourceId: line.id,
        locationId: receipt.location!.id,
        inventoryStatus: 'QUARANTINE',
        stockQty: Number(line.actualQty),
        valuationQty: Number(receipt.quantities?.valuationQty || 0),
        costAmount,
        stockLogId: receipt.movement!.id,
        idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:LOT_RECEIPT:${line.id}`,
        note: `生产订单实绩 ${actual.actualNo} 产出批次待检入库`,
        createdBy: confirmedBy,
      })
      await Promise.all([
        tx.stockLog.update({
          where: { id: receipt.movement!.id },
          data: { lotId: lot.id, inventoryStatus: 'QUARANTINE', toInventoryStatus: 'QUARANTINE' },
        }),
        receipt.costLayer ? tx.inventoryCostLayer.update({
          where: { id: receipt.costLayer.id },
          data: { lotId: lot.id, inventoryStatus: 'QUARANTINE' },
        }) : Promise.resolve(),
        createProductionQualityInspection(tx, {
          inspectionNo: `QI-${lot.lotNo}`,
          lotId: lot.id,
          sourceId: line.id,
          inspectedQty: Number(line.actualQty),
        }),
      ])
      await createProductionLotGenealogies(tx, {
        actualId: actual.id,
        outputId: line.id,
        childLotId: lot.id,
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
  line: Prisma.ProductionOrderActualOutputGetPayload<{ include: { material: true, inventoryLot: { include: { balances: true, inspections: true } } } }>,
  reason: string,
  reversedBy: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const outputQty = Number(line.actualQty)
  if (outputQty <= 0) return
  const stock = await tx.stock.findUnique({ where: { materialId: line.materialId } })
  if (!stock) throw new ProductionOrderDomainError(`产出 ${line.materialCode} 没有库存记录，无法冲销`)
  const positiveLotBalances = line.inventoryLot?.balances.filter((balance) => Number(balance.stockQty) > tolerance) || []
  const lotBalance = positiveLotBalances[0]
  const inventoryStatus = lotBalance?.inventoryStatus
  if (positiveLotBalances.some((balance) => balance.inventoryStatus === 'AVAILABLE')) {
    throw new ProductionOrderDomainError(`产出批次 ${line.inventoryLot?.lotNo} 已放行，不能直接冲销`)
  }
  if (line.inventoryLot && (positiveLotBalances.length !== 1 || !lotBalance || (inventoryStatus !== 'QUARANTINE' && inventoryStatus !== 'HOLD'))) {
    throw new ProductionOrderDomainError(`产出批次 ${line.inventoryLot.lotNo} 已分批处置、进入返工或状态异常，不能直接冲销`)
  }
  if (!line.inventoryLot && Number(stock.availableQty) + tolerance < outputQty) {
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
  await tx.inventoryCostLayer.updateMany({
    where: { sourceType: 'PRODUCTION_ORDER_ACTUAL', sourceId: actual.id, materialId: line.materialId },
    data: { remainingStockQty: 0, remainingValuationQty: 0, remainingAmount: 0, status: 'REVERSED' },
  })

  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCost = Number(stock.totalCost)
  const afterQty = roundQty(beforeQty - outputQty)
  const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - Number(line.valuationQty)))
  const afterCost = Math.max(0, roundQty(beforeCost - Number(line.costAmount)))
  const isQuarantine = inventoryStatus === 'QUARANTINE'
  const isHold = inventoryStatus === 'HOLD'
  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundQty(Number(stock.availableQty) - (!line.inventoryLot ? outputQty : 0)),
      quarantineQty: roundQty(Number(stock.quarantineQty) - (isQuarantine ? outputQty : 0)),
      holdQty: roundQty(Number(stock.holdQty) - (isHold ? outputQty : 0)),
      valuationQty: afterValuationQty,
      availableValuationQty: Math.max(0, roundQty(Number(stock.availableValuationQty) - (!line.inventoryLot ? Number(line.valuationQty) : 0))),
      quarantineValuationQty: Math.max(0, roundQty(Number(stock.quarantineValuationQty) - (isQuarantine ? Number(line.valuationQty) : 0))),
      holdValuationQty: Math.max(0, roundQty(Number(stock.holdValuationQty) - (isHold ? Number(line.valuationQty) : 0))),
      totalCost: afterCost,
      quarantineCost: Math.max(0, roundQty(Number(stock.quarantineCost) - (isQuarantine ? Number(line.costAmount) : 0))),
      holdCost: Math.max(0, roundQty(Number(stock.holdCost) - (isHold ? Number(line.costAmount) : 0))),
      valuationUnitCost: afterValuationQty > 0 ? afterCost / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCost / afterQty : 0,
    },
  })
  const { location } = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: line.locationId,
    qtyDelta: -outputQty,
    availableDelta: !line.inventoryLot ? -outputQty : 0,
    quarantineDelta: isQuarantine ? -outputQty : 0,
    holdDelta: isHold ? -outputQty : 0,
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
      lotId: line.inventoryLot?.id,
      inventoryStatus: inventoryStatus || 'AVAILABLE',
      fromInventoryStatus: inventoryStatus || 'AVAILABLE',
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
  if (line.inventoryLot && lotBalance && (inventoryStatus === 'QUARANTINE' || inventoryStatus === 'HOLD')) {
    await tx.inventoryLotBalance.update({
      where: { id: lotBalance.id },
      data: { stockQty: 0, valuationQty: 0, costAmount: 0 },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: line.inventoryLot.id,
        locationId: lotBalance.locationId,
        type: 'REVERSE_RECEIPT',
        fromStatus: inventoryStatus,
        stockQty: outputQty,
        valuationQty: Number(line.valuationQty),
        costAmount: Number(line.costAmount),
        refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE',
        refId: actual.id,
        stockLogId: reversalMovement.id,
        idempotencyKey: `PRODUCTION_ACTUAL:${actual.id}:LOT_REVERSE:${line.id}`,
        note: `冲销生产订单实绩 ${actual.actualNo}: ${reason}`,
        createdBy: reversedBy,
      },
    })
    await tx.inventoryLot.update({
      where: { id: line.inventoryLot.id },
      data: { status: 'REVERSED', reversedAt: new Date(), reversedBy, reverseReason: reason },
    })
    await tx.qualityInspection.updateMany({
      where: { lotId: line.inventoryLot.id },
      data: { status: 'REVERSED' },
    })
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
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return prisma.$transaction(async (tx) => {
    const actual = await requireProductionOrderActual(tx, orderId, actualId, 'CONFIRMED')
    assertProductionActualDataScope(scope, actual)
    assertInventoryLocationDataScope(scope, [...actual.inputs.map((line) => line.locationId), ...actual.outputs.map((line) => line.locationId)])
    for (const line of actual.outputs) await reverseProductionOutput(tx, actual, line, input.reason, reversedBy)
    for (const line of actual.inputs) await restoreProductionInput(tx, actual, line, reversedBy)
    await reverseProductionLotAllocations(tx, { actualId: actual.id, reversedBy })

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
