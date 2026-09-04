import type { Prisma } from '@prisma/client'
import {
  consumeAvailableInventoryLots,
  distributeIssueValue,
  roundQty,
  tolerance,
} from './inventory-lot-issue-service'

export async function allocateShipmentInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
    shipmentItemId: string
    materialId: string
    materialCode: string
    locationId: string
    locationCode: string
    stockQty: number
    locationStockQtyAdjustment?: number
    issueValuationQty: number
    issueCostAmount: number
    stockLogId?: string | null
    createdBy?: string | null
  },
) {
  const existing = await tx.shipmentLotAllocation.findMany({
    where: { shipmentItemId: input.shipmentItemId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing
  const consumed = await consumeAvailableInventoryLots(tx, input)
  let allocatedValuationQty = 0
  let allocatedCostAmount = 0
  for (let index = 0; index < consumed.length; index += 1) {
    const item = consumed[index]
    const last = index === consumed.length - 1
    const valuationQty = distributeIssueValue(input.issueValuationQty, item.stockQty, input.stockQty, allocatedValuationQty, last)
    const costAmount = distributeIssueValue(input.issueCostAmount, item.stockQty, input.stockQty, allocatedCostAmount, last)
    allocatedValuationQty = roundQty(allocatedValuationQty + valuationQty)
    allocatedCostAmount = roundQty(allocatedCostAmount + costAmount)
    await tx.shipmentLotAllocation.create({
      data: {
        shipmentId: input.shipmentId, shipmentItemId: input.shipmentItemId, lotId: item.lotId, locationId: input.locationId,
        inventoryStatus: 'AVAILABLE', stockQty: item.stockQty, valuationQty, costAmount,
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: item.lotId, locationId: input.locationId, type: 'SHIPMENT_OUT', fromStatus: 'AVAILABLE',
        stockQty: -item.stockQty, valuationQty: -item.balanceValuationQty, costAmount: -item.balanceCostAmount,
        refType: 'SHIPMENT', refId: input.shipmentId, stockLogId: input.stockLogId || null,
        idempotencyKey: `SHIPMENT:${input.shipmentId}:ITEM:${input.shipmentItemId}:LOT:${item.lotId}`,
        note: '发货单内部批次分配', createdBy: input.createdBy || null,
      },
    })
  }
  const allocatedStockQty = consumed.reduce((sum, item) => sum + item.stockQty, 0)
  if (Math.abs(allocatedStockQty - input.stockQty) > tolerance) throw new Error('发货批次分配数量与库存出库数量不一致')
  return tx.shipmentLotAllocation.findMany({
    where: { shipmentItemId: input.shipmentItemId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}

export async function reverseShipmentInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
    shipmentItemId: string
    stockLogId: string
    reason: string
    reversedBy: string
    allowEmpty?: boolean
  },
) {
  const allocations = await tx.shipmentLotAllocation.findMany({
    where: { shipmentId: input.shipmentId, shipmentItemId: input.shipmentItemId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  })
  if (allocations.length === 0) {
    if (input.allowEmpty) return allocations
    throw new Error('原发货批次分配不存在，不能建立可信冲销')
  }

  for (const allocation of allocations) {
    if (Number(allocation.returnedStockQty) > tolerance) {
      throw new Error('原发货明细已经发生退货，不能再整单冲销')
    }
    const sourceTransactions = await tx.inventoryLotTransaction.findMany({
      where: {
        lotId: allocation.lotId,
        refType: 'SHIPMENT',
        refId: input.shipmentId,
        type: { in: ['SHIPMENT_OUT', 'SHIPMENT_SHORTAGE_SETTLEMENT'] },
        idempotencyKey: { startsWith: `SHIPMENT:${input.shipmentId}:ITEM:${input.shipmentItemId}:LOT:${allocation.lotId}` },
      },
    })
    if (sourceTransactions.length === 0) throw new Error('原发货批次流水不存在，不能建立可信冲销')
    const reversalKey = `SHIPMENT:${input.shipmentId}:ITEM:${input.shipmentItemId}:LOT:${allocation.lotId}:REVERSE`
    const existing = await tx.inventoryLotTransaction.findUnique({ where: { idempotencyKey: reversalKey } })
    if (existing) throw new Error('原发货批次流水已经冲销，不能重复冲销')

    const stockQty = roundQty(sourceTransactions.reduce((sum, item) => sum + Math.abs(Number(item.stockQty)), 0))
    const valuationQty = roundQty(sourceTransactions.reduce((sum, item) => sum + Math.abs(Number(item.valuationQty)), 0))
    const costAmount = roundQty(sourceTransactions.reduce((sum, item) => sum + Math.abs(Number(item.costAmount)), 0))
    if (Math.abs(stockQty - Number(allocation.stockQty)) > tolerance) {
      throw new Error('原发货批次流水与批次分配数量不一致，不能建立可信冲销')
    }
    await tx.inventoryLotBalance.upsert({
      where: {
        lotId_locationId_inventoryStatus: {
          lotId: allocation.lotId,
          locationId: allocation.locationId,
          inventoryStatus: allocation.inventoryStatus,
        },
      },
      update: {
        stockQty: { increment: stockQty },
        valuationQty: { increment: valuationQty },
        costAmount: { increment: costAmount },
      },
      create: {
        lotId: allocation.lotId,
        locationId: allocation.locationId,
        inventoryStatus: allocation.inventoryStatus,
        stockQty,
        valuationQty,
        costAmount,
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: allocation.lotId,
        locationId: allocation.locationId,
        type: 'SHIPMENT_REVERSE_IN',
        toStatus: allocation.inventoryStatus,
        stockQty,
        valuationQty,
        costAmount,
        refType: 'SHIPMENT_REVERSAL',
        refId: input.shipmentId,
        stockLogId: input.stockLogId,
        idempotencyKey: reversalKey,
        note: `发货冲销：${input.reason}`,
        createdBy: input.reversedBy,
      },
    })
    await tx.shipmentLotAllocation.update({
      where: { id: allocation.id },
      data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: input.reversedBy, reverseReason: input.reason },
    })
  }
  return allocations
}

export async function createHistoricalShipmentLotAllocation(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
    shipmentItemId: string
    shipmentNo: string
    materialId: string
    materialCode: string
    locationId: string
    stockQty: number
    valuationQty: number
    costAmount: number
    previouslyReturnedStockQty?: number
    createdBy?: string | null
  },
) {
  const existing = await tx.shipmentLotAllocation.findMany({
    where: { shipmentItemId: input.shipmentItemId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing
  const safeShipmentNo = input.shipmentNo.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48)
  const lot = await tx.inventoryLot.create({
    data: {
      lotNo: `LEGACY-${safeShipmentNo}`, materialId: input.materialId,
      sourceType: 'LEGACY_SHIPMENT', sourceId: input.shipmentId,
      receivedAt: new Date(0),
    },
  })
  const returnedStockQty = Math.max(0, roundQty(input.previouslyReturnedStockQty || 0))
  const returnedRatio = input.stockQty > tolerance ? returnedStockQty / input.stockQty : 0
  await tx.shipmentLotAllocation.create({
    data: {
      shipmentId: input.shipmentId, shipmentItemId: input.shipmentItemId, lotId: lot.id, locationId: input.locationId,
      stockQty: input.stockQty, valuationQty: input.valuationQty, costAmount: input.costAmount,
      returnedStockQty,
      returnedValuationQty: roundQty(input.valuationQty * returnedRatio),
      returnedCostAmount: roundQty(input.costAmount * returnedRatio),
    },
  })
  await tx.inventoryLotTransaction.create({
    data: {
      lotId: lot.id, locationId: input.locationId, type: 'LEGACY_SHIPMENT_OUT', fromStatus: 'AVAILABLE',
      stockQty: -input.stockQty, valuationQty: -input.valuationQty, costAmount: -input.costAmount,
      refType: 'SHIPMENT', refId: input.shipmentId,
      idempotencyKey: `LEGACY_SHIPMENT:${input.shipmentId}:ITEM:${input.shipmentItemId}:LOT`,
      note: `历史发货单 ${input.shipmentNo} 未记录真实内部批次，仅作显式兼容`, createdBy: input.createdBy || null,
    },
  })
  await tx.shipment.update({ where: { id: input.shipmentId }, data: { lotTraceStatus: 'LEGACY' } })
  return tx.shipmentLotAllocation.findMany({
    where: { shipmentItemId: input.shipmentItemId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}

export async function allocateReturnToShipmentLots(
  tx: Prisma.TransactionClient,
  input: {
    returnOrderId: string
    shipmentItemId: string
    returnedLotId: string
    stockQty: number
    valuationQty: number
    costAmount: number
  },
) {
  const existing = await tx.returnLotAllocation.findMany({
    where: { returnOrderId: input.returnOrderId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing
  const allocations = await tx.shipmentLotAllocation.findMany({
    where: { shipmentItemId: input.shipmentItemId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
  })
  let remainingStockQty = roundQty(input.stockQty)
  let allocatedValuationQty = 0
  let allocatedCostAmount = 0
  const slices: Array<{ allocationId: string; stockQty: number }> = []
  for (const allocation of allocations) {
    if (remainingStockQty <= tolerance) break
    const returnable = roundQty(Number(allocation.stockQty) - Number(allocation.returnedStockQty))
    if (returnable <= tolerance) continue
    const stockQty = roundQty(Math.min(returnable, remainingStockQty))
    slices.push({ allocationId: allocation.id, stockQty })
    remainingStockQty = roundQty(remainingStockQty - stockQty)
  }
  if (remainingStockQty > tolerance) throw new Error(`原发货批次可退数量不足：尚缺 ${remainingStockQty}`)
  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index]
    const last = index === slices.length - 1
    const valuationQty = distributeIssueValue(input.valuationQty, slice.stockQty, input.stockQty, allocatedValuationQty, last)
    const costAmount = distributeIssueValue(input.costAmount, slice.stockQty, input.stockQty, allocatedCostAmount, last)
    allocatedValuationQty = roundQty(allocatedValuationQty + valuationQty)
    allocatedCostAmount = roundQty(allocatedCostAmount + costAmount)
    await tx.returnLotAllocation.create({
      data: {
        returnOrderId: input.returnOrderId, shipmentAllocationId: slice.allocationId, returnedLotId: input.returnedLotId,
        stockQty: slice.stockQty, valuationQty, costAmount,
      },
    })
    await tx.shipmentLotAllocation.update({
      where: { id: slice.allocationId },
      data: {
        returnedStockQty: { increment: slice.stockQty },
        returnedValuationQty: { increment: valuationQty },
        returnedCostAmount: { increment: costAmount },
      },
    })
  }
  return tx.returnLotAllocation.findMany({
    where: { returnOrderId: input.returnOrderId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
  })
}
