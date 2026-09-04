import type { Prisma } from '@prisma/client'

const tolerance = 0.000001
const roundQty = (value: number) => Number(value.toFixed(6))

export async function recordShipmentStockShortage(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
    shipmentItemId: string
    materialId: string
    locationId: string
    stockQty: number
  },
) {
  const stockQty = roundQty(input.stockQty)
  if (stockQty <= tolerance) return null
  return tx.shipmentStockShortage.create({
    data: {
      shipmentId: input.shipmentId,
      shipmentItemId: input.shipmentItemId,
      materialId: input.materialId,
      locationId: input.locationId,
      stockQty,
    },
  })
}

type CostSlice = {
  costLayerId: string | null
  stockQty: number
  valuationQty: number
  costAmount: number
}

async function consumeAvailableCostLayers(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string
    materialId: string
    stockQty: number
    fallbackValuationQty: number
    fallbackCostAmount: number
    costLayerId?: string | null
  },
) {
  if (input.costLayerId) {
    await tx.inventoryCostLayer.update({
      where: { id: input.costLayerId },
      data: { lotId: input.lotId, inventoryStatus: 'AVAILABLE' },
    })
  }
  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      materialId: input.materialId,
      inventoryStatus: 'AVAILABLE',
      status: 'OPEN',
      remainingStockQty: { gt: tolerance },
      OR: [
        { lotId: input.lotId },
        ...(input.costLayerId ? [{ id: input.costLayerId }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  if (layers.length === 0) {
    return [{
      costLayerId: null,
      stockQty: input.stockQty,
      valuationQty: input.fallbackValuationQty,
      costAmount: input.fallbackCostAmount,
    }] satisfies CostSlice[]
  }

  let remaining = input.stockQty
  const slices: CostSlice[] = []
  for (const layer of layers) {
    if (remaining <= tolerance) break
    const layerStockQty = Number(layer.remainingStockQty)
    const stockQty = roundQty(Math.min(layerStockQty, remaining))
    const ratio = layerStockQty > tolerance ? stockQty / layerStockQty : 0
    const valuationQty = roundQty(Number(layer.remainingValuationQty) * ratio)
    const costAmount = roundQty(Number(layer.remainingAmount) * ratio)
    const nextStockQty = Math.max(0, roundQty(layerStockQty - stockQty))
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: {
        remainingStockQty: nextStockQty,
        remainingValuationQty: Math.max(0, roundQty(Number(layer.remainingValuationQty) - valuationQty)),
        remainingAmount: Math.max(0, roundQty(Number(layer.remainingAmount) - costAmount)),
        status: nextStockQty <= tolerance ? 'CLOSED' : 'OPEN',
      },
    })
    slices.push({ costLayerId: layer.id, stockQty, valuationQty, costAmount })
    remaining = roundQty(remaining - stockQty)
  }
  if (remaining > tolerance) throw new Error('补欠库批次的可用成本层数量不足')
  return slices
}

export async function settleShipmentStockShortagesWithLot(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string
    costLayerId?: string | null
    createdBy?: string | null
  },
) {
  const lot = await tx.inventoryLot.findUnique({
    where: { id: input.lotId },
    include: {
      balances: { where: { inventoryStatus: 'AVAILABLE', stockQty: { gt: tolerance } } },
      material: { select: { stockUnit: true, valuationUnit: true, costingMethod: true } },
    },
  })
  if (!lot || lot.status !== 'OPEN' || lot.balances.length === 0) return { settledStockQty: 0 }
  if (lot.balances.length !== 1) throw new Error(`批次 ${lot.lotNo} 没有唯一的可用库位余额，不能自动补欠库`)
  const balance = lot.balances[0]
  const shortages = await tx.shipmentStockShortage.findMany({
    where: {
      materialId: lot.materialId,
      locationId: balance.locationId,
      status: 'OPEN',
      shipment: { status: { in: ['SHIPPED', 'DELIVERED'] } },
    },
    include: { shipment: { select: { shipmentNo: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (shortages.length === 0) return { settledStockQty: 0 }

  let availableStockQty = Number(balance.stockQty)
  let availableValuationQty = Number(balance.valuationQty)
  let availableCostAmount = Number(balance.costAmount)
  let settledStockQty = 0
  for (const shortage of shortages) {
    if (availableStockQty <= tolerance) break
    const outstanding = roundQty(Number(shortage.stockQty) - Number(shortage.settledStockQty))
    if (outstanding <= tolerance) continue
    const stockQty = roundQty(Math.min(outstanding, availableStockQty))
    const ratio = availableStockQty > tolerance ? stockQty / availableStockQty : 0
    const fallbackValuationQty = stockQty >= availableStockQty - tolerance
      ? availableValuationQty
      : roundQty(availableValuationQty * ratio)
    const fallbackCostAmount = stockQty >= availableStockQty - tolerance
      ? availableCostAmount
      : roundQty(availableCostAmount * ratio)
    const slices = await consumeAvailableCostLayers(tx, {
      lotId: lot.id,
      materialId: lot.materialId,
      stockQty,
      fallbackValuationQty,
      fallbackCostAmount,
      costLayerId: input.costLayerId,
    })
    const valuationQty = roundQty(slices.reduce((sum, item) => sum + item.valuationQty, 0))
    const costAmount = roundQty(slices.reduce((sum, item) => sum + item.costAmount, 0))
    const stock = await tx.stock.findUnique({ where: { materialId: lot.materialId } })
    if (!stock) throw new Error(`批次 ${lot.lotNo} 对应库存不存在`)
    const beforeValuationQty = Number(stock.valuationQty)
    const beforeCostAmount = Number(stock.totalCost)
    const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - valuationQty))
    const afterCostAmount = Math.max(0, roundQty(beforeCostAmount - costAmount))
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        valuationQty: afterValuationQty,
        availableValuationQty: Math.max(0, roundQty(Number(stock.availableValuationQty) - valuationQty)),
        totalCost: afterCostAmount,
        valuationUnitCost: afterValuationQty > tolerance ? afterCostAmount / afterValuationQty : 0,
        stockUnitCost: Number(stock.qty) > tolerance ? afterCostAmount / Number(stock.qty) : 0,
      },
    })
    availableStockQty = Math.max(0, roundQty(availableStockQty - stockQty))
    availableValuationQty = Math.max(0, roundQty(availableValuationQty - valuationQty))
    availableCostAmount = Math.max(0, roundQty(availableCostAmount - costAmount))
    await tx.inventoryLotBalance.update({
      where: { id: balance.id },
      data: {
        stockQty: availableStockQty,
        valuationQty: availableValuationQty,
        costAmount: availableCostAmount,
      },
    })
    const allocation = await tx.shipmentLotAllocation.upsert({
      where: {
        shipmentItemId_lotId_locationId: {
          shipmentItemId: shortage.shipmentItemId,
          lotId: lot.id,
          locationId: balance.locationId,
        },
      },
      update: {
        stockQty: { increment: stockQty },
        valuationQty: { increment: valuationQty },
        costAmount: { increment: costAmount },
      },
      create: {
        shipmentId: shortage.shipmentId,
        shipmentItemId: shortage.shipmentItemId,
        lotId: lot.id,
        locationId: balance.locationId,
        inventoryStatus: 'AVAILABLE',
        stockQty,
        valuationQty,
        costAmount,
      },
    })
    const stockLog = await tx.stockLog.create({
      data: {
        stockId: stock.id,
        locationId: balance.locationId,
        type: 'SHIPMENT_SHORTAGE_SETTLEMENT',
        qty: 0,
        beforeQty: Number(stock.qty),
        afterQty: Number(stock.qty),
        valuationQty: -valuationQty,
        beforeValuationQty,
        afterValuationQty,
        costAmount: -costAmount,
        beforeCostAmount,
        afterCostAmount,
        stockUnitSnapshot: lot.material.stockUnit,
        valuationUnitSnapshot: lot.material.valuationUnit,
        costingMethodSnapshot: lot.material.costingMethod,
        lotId: lot.id,
        inventoryStatus: 'AVAILABLE',
        refType: 'SHIPMENT_SHORTAGE',
        refId: shortage.id,
        idempotencyKey: `SHIPMENT_SHORTAGE:${shortage.id}:LOT:${lot.id}:${roundQty(Number(shortage.settledStockQty))}`,
        note: `批次 ${lot.lotNo} 自动补齐发货单 ${shortage.shipment.shipmentNo} 欠库`,
        createdBy: input.createdBy || null,
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: lot.id,
        locationId: balance.locationId,
        type: 'SHIPMENT_SHORTAGE_SETTLEMENT',
        fromStatus: 'AVAILABLE',
        stockQty: -stockQty,
        valuationQty: -valuationQty,
        costAmount: -costAmount,
        refType: 'SHIPMENT',
        refId: shortage.shipmentId,
        stockLogId: stockLog.id,
        idempotencyKey: `SHIPMENT:${shortage.shipmentId}:ITEM:${shortage.shipmentItemId}:LOT:${lot.id}:SHORTAGE:${roundQty(Number(shortage.settledStockQty))}`,
        note: `补齐发货欠库 ${shortage.shipment.shipmentNo}`,
        createdBy: input.createdBy || null,
      },
    })
    for (const slice of slices) {
      await tx.shipmentStockShortageSettlement.create({
        data: {
          shortageId: shortage.id,
          lotId: lot.id,
          costLayerId: slice.costLayerId,
          stockLogId: stockLog.id,
          shipmentAllocationId: allocation.id,
          stockQty: slice.stockQty,
          valuationQty: slice.valuationQty,
          costAmount: slice.costAmount,
        },
      })
    }
    const nextSettledStockQty = roundQty(Number(shortage.settledStockQty) + stockQty)
    const isSettled = nextSettledStockQty >= Number(shortage.stockQty) - tolerance
    await tx.shipmentStockShortage.update({
      where: { id: shortage.id },
      data: {
        settledStockQty: nextSettledStockQty,
        settledValuationQty: { increment: valuationQty },
        settledCostAmount: { increment: costAmount },
        status: isSettled ? 'SETTLED' : 'OPEN',
        settledAt: isSettled ? new Date() : null,
      },
    })
    await tx.shipmentItem.update({
      where: { id: shortage.shipmentItemId },
      data: {
        shippedValuationQty: { increment: valuationQty },
        shippedCostAmount: { increment: costAmount },
      },
    })
    await tx.shipment.update({
      where: { id: shortage.shipmentId },
      data: {
        shippedValuationQty: { increment: valuationQty },
        shippedCostAmount: { increment: costAmount },
      },
    })
    settledStockQty = roundQty(settledStockQty + stockQty)
  }

  const affectedShipmentIds = Array.from(new Set(shortages.map((item) => item.shipmentId)))
  for (const shipmentId of affectedShipmentIds) {
    const openCount = await tx.shipmentStockShortage.count({ where: { shipmentId, status: 'OPEN' } })
    if (openCount === 0) await tx.shipment.update({ where: { id: shipmentId }, data: { lotTraceStatus: 'TRACKED' } })
  }
  return { settledStockQty }
}

export async function reverseShipmentStockShortages(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
    shipmentItemId: string
    reversedBy: string
    reason: string
  },
) {
  const shortage = await tx.shipmentStockShortage.findUnique({
    where: { shipmentItemId: input.shipmentItemId },
    include: { settlements: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } } },
  })
  if (!shortage) return { hadShortage: false, restoredValuationQty: 0, restoredCostAmount: 0 }
  if (shortage.shipmentId !== input.shipmentId) throw new Error('发货欠库与发货明细关联不一致')
  const restoredValuationQty = roundQty(shortage.settlements.reduce((sum, item) => sum + Number(item.valuationQty), 0))
  const restoredCostAmount = roundQty(shortage.settlements.reduce((sum, item) => sum + Number(item.costAmount), 0))
  for (const settlement of shortage.settlements) {
    if (settlement.costLayerId) {
      const layer = await tx.inventoryCostLayer.findUnique({ where: { id: settlement.costLayerId } })
      if (!layer) throw new Error('补欠库成本层不存在，不能建立可信冲销')
      const nextStockQty = roundQty(Number(layer.remainingStockQty) + Number(settlement.stockQty))
      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: {
          remainingStockQty: nextStockQty,
          remainingValuationQty: { increment: Number(settlement.valuationQty) },
          remainingAmount: { increment: Number(settlement.costAmount) },
          status: 'OPEN',
        },
      })
    }
  }
  if (restoredValuationQty > tolerance || restoredCostAmount > tolerance) {
    const stock = await tx.stock.findUnique({ where: { materialId: shortage.materialId } })
    if (!stock) throw new Error('发货欠库对应库存不存在，不能冲销')
    const afterValuationQty = roundQty(Number(stock.valuationQty) + restoredValuationQty)
    const afterCostAmount = roundQty(Number(stock.totalCost) + restoredCostAmount)
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        valuationQty: afterValuationQty,
        availableValuationQty: roundQty(Number(stock.availableValuationQty) + restoredValuationQty),
        totalCost: afterCostAmount,
        valuationUnitCost: afterValuationQty > tolerance ? afterCostAmount / afterValuationQty : 0,
        stockUnitCost: Number(stock.qty) > tolerance ? afterCostAmount / Number(stock.qty) : 0,
      },
    })
    await tx.stockLog.create({
      data: {
        stockId: stock.id,
        locationId: shortage.locationId,
        type: 'SHIPMENT_SHORTAGE_SETTLEMENT_REVERSE',
        qty: 0,
        beforeQty: Number(stock.qty),
        afterQty: Number(stock.qty),
        valuationQty: restoredValuationQty,
        beforeValuationQty: Number(stock.valuationQty),
        afterValuationQty,
        costAmount: restoredCostAmount,
        beforeCostAmount: Number(stock.totalCost),
        afterCostAmount,
        refType: 'SHIPMENT_REVERSAL',
        refId: input.shipmentId,
        idempotencyKey: `SHIPMENT_SHORTAGE:${shortage.id}:REVERSE`,
        note: `发货欠库补账冲销：${input.reason}`,
        createdBy: input.reversedBy,
      },
    })
  }
  await tx.shipmentStockShortageSettlement.updateMany({
    where: { shortageId: shortage.id, status: 'ACTIVE' },
    data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: input.reversedBy },
  })
  await tx.shipmentStockShortage.update({
    where: { id: shortage.id },
    data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: input.reversedBy, reverseReason: input.reason },
  })
  return { hadShortage: true, restoredValuationQty, restoredCostAmount }
}
