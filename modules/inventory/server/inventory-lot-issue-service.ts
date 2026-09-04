import type { Prisma } from '@prisma/client'
import type { InventoryStatus } from '../domain/inventory-status'
import { settleShipmentStockShortagesWithLot } from './shipment-stock-shortage-service'

export const roundQty = (value: number) => Number(value.toFixed(6))
export const tolerance = 0.000001

export async function createInventoryLotReceipt(
  tx: Prisma.TransactionClient,
  input: {
    lotNo: string
    materialId: string
    materialInId?: string | null
    productionOutputId?: string | null
    returnOrderId?: string | null
    sourceType: string
    sourceId: string
    supplierLotNo?: string | null
    receivedAt?: Date | null
    locationId: string
    inventoryStatus: InventoryStatus
    stockQty: number
    valuationQty: number
    costAmount: number
    stockLogId?: string | null
    costLayerId?: string | null
    idempotencyKey: string
    note?: string | null
    createdBy?: string | null
  },
) {
  const lot = await tx.inventoryLot.create({
    data: {
      lotNo: input.lotNo,
      materialId: input.materialId,
      materialInId: input.materialInId || null,
      productionOutputId: input.productionOutputId || null,
      returnOrderId: input.returnOrderId || null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      supplierLotNo: input.supplierLotNo || null,
      receivedAt: input.receivedAt || undefined,
      balances: {
        create: {
          locationId: input.locationId,
          inventoryStatus: input.inventoryStatus,
          stockQty: roundQty(input.stockQty),
          valuationQty: roundQty(input.valuationQty),
          costAmount: roundQty(input.costAmount),
        },
      },
      transactions: {
        create: {
          locationId: input.locationId,
          type: 'RECEIPT',
          toStatus: input.inventoryStatus,
          stockQty: roundQty(input.stockQty),
          valuationQty: roundQty(input.valuationQty),
          costAmount: roundQty(input.costAmount),
          refType: input.sourceType,
          refId: input.sourceId,
          stockLogId: input.stockLogId || null,
          idempotencyKey: input.idempotencyKey,
          note: input.note || null,
          createdBy: input.createdBy || null,
        },
      },
    },
    include: { balances: true },
  })
  if (input.inventoryStatus === 'AVAILABLE') {
    await settleShipmentStockShortagesWithLot(tx, {
      lotId: lot.id,
      costLayerId: input.costLayerId,
      createdBy: input.createdBy,
    })
  }
  return lot
}

export type InventoryLotIssueAllocation = {
  lotId: string
  lotNo: string
  sourceType: string
  sourceId: string
  supplierLotNo: string | null
  locationId: string
  stockQty: number
  valuationQty: number
  costAmount: number
}

export type ConsumedInventoryLot = InventoryLotIssueAllocation & {
  balanceValuationQty: number
  balanceCostAmount: number
}

function legacyLotNo(materialCode: string, locationCode: string) {
  const safeMaterial = materialCode.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'MATERIAL'
  const safeLocation = locationCode.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 24) || 'LOCATION'
  return `LEGACY-${safeMaterial}-${safeLocation}`
}

export async function ensureLegacyAvailableLot(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    locationId: string
    materialCode: string
    locationCode: string
    stockQty: number
    locationStockQtyAdjustment?: number
    issueValuationQty: number
    issueCostAmount: number
    createdBy?: string | null
  },
) {
  const [locationBalance, tracked] = await Promise.all([
    tx.stockLocationBalance.findFirst({
      where: { stock: { materialId: input.materialId }, locationId: input.locationId },
      select: { availableQty: true },
    }),
    tx.inventoryLotBalance.aggregate({
      where: {
        lot: { materialId: input.materialId, status: 'OPEN' },
        locationId: input.locationId,
        inventoryStatus: 'AVAILABLE',
        stockQty: { gt: tolerance },
      },
      _sum: { stockQty: true, valuationQty: true, costAmount: true },
    }),
  ])
  const preIssueLocationQty = roundQty(
    Number(locationBalance?.availableQty || 0) + Number(input.locationStockQtyAdjustment ?? input.stockQty),
  )
  const untrackedStockQty = roundQty(preIssueLocationQty - Number(tracked._sum.stockQty || 0))
  if (untrackedStockQty <= tolerance) return null

  const stock = await tx.stock.findUniqueOrThrow({ where: { materialId: input.materialId } })
  const availableStockQty = roundQty(Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) - Number(stock.reworkQty) + Number(input.stockQty))
  const availableValuationQty = roundQty(Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty) + Number(input.issueValuationQty))
  const availableCostAmount = roundQty(Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) - Number(stock.reworkCost) + Number(input.issueCostAmount))
  const valuationQty = availableStockQty > tolerance
    ? roundQty(untrackedStockQty * availableValuationQty / availableStockQty)
    : 0
  const costAmount = availableStockQty > tolerance
    ? roundQty(untrackedStockQty * availableCostAmount / availableStockQty)
    : 0
  const lotNo = legacyLotNo(input.materialCode, input.locationCode)
  const existing = await tx.inventoryLot.findUnique({ where: { lotNo }, include: { balances: true } })
  if (existing) {
    const balance = existing.balances.find((item) => item.locationId === input.locationId && item.inventoryStatus === 'AVAILABLE')
    if (balance) {
      await tx.inventoryLotBalance.update({
        where: { id: balance.id },
        data: {
          stockQty: { increment: untrackedStockQty },
          valuationQty: { increment: valuationQty },
          costAmount: { increment: costAmount },
        },
      })
    } else {
      await tx.inventoryLotBalance.create({
        data: { lotId: existing.id, locationId: input.locationId, inventoryStatus: 'AVAILABLE', stockQty: untrackedStockQty, valuationQty, costAmount },
      })
    }
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: existing.id, locationId: input.locationId, type: 'LEGACY_RECONCILE', toStatus: 'AVAILABLE',
        stockQty: untrackedStockQty, valuationQty, costAmount, refType: 'LEGACY_INVENTORY', refId: `${input.materialId}:${input.locationId}`,
        idempotencyKey: `LEGACY_LOT:${input.materialId}:${input.locationId}:RECONCILE:${Date.now()}`,
        note: '将历史未追踪可用库存纳入兼容批次；不代表真实供应商或生产来源', createdBy: input.createdBy || null,
      },
    })
    return existing.id
  }

  const created = await createInventoryLotReceipt(tx, {
    lotNo, materialId: input.materialId, sourceType: 'LEGACY_INVENTORY', sourceId: `${input.materialId}:${input.locationId}`,
    locationId: input.locationId, inventoryStatus: 'AVAILABLE', stockQty: untrackedStockQty, valuationQty, costAmount,
    idempotencyKey: `LEGACY_LOT:${input.materialId}:${input.locationId}:OPENING`,
    receivedAt: new Date(0),
    note: '历史未追踪可用库存兼容批次；不代表真实供应商或生产来源', createdBy: input.createdBy || null,
  })
  return created.id
}

export async function consumeAvailableInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    materialCode: string
    locationId: string
    locationCode: string
    stockQty: number
    locationStockQtyAdjustment?: number
    issueValuationQty: number
    issueCostAmount: number
    createdBy?: string | null
  },
) {
  await ensureLegacyAvailableLot(tx, input)
  const balances = await tx.inventoryLotBalance.findMany({
    where: {
      lot: { materialId: input.materialId, status: 'OPEN' },
      locationId: input.locationId,
      inventoryStatus: 'AVAILABLE',
      stockQty: { gt: tolerance },
    },
    include: { lot: true },
    orderBy: [{ lot: { receivedAt: 'asc' } }, { createdAt: 'asc' }],
  })
  let remainingStockQty = roundQty(input.stockQty)
  const allocations: ConsumedInventoryLot[] = []
  for (const balance of balances) {
    if (remainingStockQty <= tolerance) break
    const balanceStockQty = Number(balance.stockQty)
    const stockQty = roundQty(Math.min(balanceStockQty, remainingStockQty))
    const ratio = balanceStockQty > tolerance ? stockQty / balanceStockQty : 0
    const balanceValuationQty = roundQty(Number(balance.valuationQty) * ratio)
    const balanceCostAmount = roundQty(Number(balance.costAmount) * ratio)
    const afterStockQty = roundQty(balanceStockQty - stockQty)
    const afterValuationQty = Math.max(0, roundQty(Number(balance.valuationQty) - balanceValuationQty))
    const afterCostAmount = Math.max(0, roundQty(Number(balance.costAmount) - balanceCostAmount))
    await tx.inventoryLotBalance.update({
      where: { id: balance.id },
      data: { stockQty: afterStockQty, valuationQty: afterValuationQty, costAmount: afterCostAmount },
    })
    allocations.push({
      lotId: balance.lotId, lotNo: balance.lot.lotNo, sourceType: balance.lot.sourceType, sourceId: balance.lot.sourceId,
      supplierLotNo: balance.lot.supplierLotNo, locationId: input.locationId, stockQty,
      valuationQty: balanceValuationQty, costAmount: balanceCostAmount, balanceValuationQty, balanceCostAmount,
    })
    remainingStockQty = roundQty(remainingStockQty - stockQty)
  }
  if (remainingStockQty > tolerance) {
    throw new Error(`物料 ${input.materialCode} 可用批次余额不足：尚缺 ${remainingStockQty}`)
  }

  return allocations
}

export async function consumeAvailableInventoryLotsForReference(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    materialCode: string
    locationId: string
    locationCode: string
    stockQty: number
    issueValuationQty: number
    issueCostAmount: number
    refType: string
    refId: string
    transactionType: string
    idempotencyPrefix: string
    note: string
    stockLogId?: string | null
    createdBy?: string | null
  },
) {
  const existing = await tx.inventoryLotTransaction.findMany({
    where: { refType: input.refType, refId: input.refId },
    include: { lot: true },
    orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing.map((transaction) => ({
    lotId: transaction.lotId,
    lotNo: transaction.lot.lotNo,
    locationId: transaction.locationId,
    stockQty: Math.abs(Number(transaction.stockQty)),
    valuationQty: Math.abs(Number(transaction.valuationQty)),
    costAmount: Math.abs(Number(transaction.costAmount)),
    transaction,
  }))

  const consumed = await consumeAvailableInventoryLots(tx, input)
  let allocatedValuationQty = 0
  let allocatedCostAmount = 0
  const result = []
  for (let index = 0; index < consumed.length; index += 1) {
    const item = consumed[index]
    const last = index === consumed.length - 1
    const valuationQty = distributeIssueValue(input.issueValuationQty, item.stockQty, input.stockQty, allocatedValuationQty, last)
    const costAmount = distributeIssueValue(input.issueCostAmount, item.stockQty, input.stockQty, allocatedCostAmount, last)
    allocatedValuationQty = roundQty(allocatedValuationQty + valuationQty)
    allocatedCostAmount = roundQty(allocatedCostAmount + costAmount)
    const transaction = await tx.inventoryLotTransaction.create({
      data: {
        lotId: item.lotId,
        locationId: input.locationId,
        type: input.transactionType,
        fromStatus: 'AVAILABLE',
        stockQty: -item.stockQty,
        valuationQty: -item.balanceValuationQty,
        costAmount: -item.balanceCostAmount,
        refType: input.refType,
        refId: input.refId,
        stockLogId: input.stockLogId || null,
        idempotencyKey: `${input.idempotencyPrefix}:LOT:${item.lotId}`,
        note: input.note,
        createdBy: input.createdBy || null,
      },
    })
    result.push({
      lotId: item.lotId,
      lotNo: item.lotNo,
      locationId: input.locationId,
      stockQty: item.stockQty,
      valuationQty,
      costAmount,
      transaction,
    })
  }
  const allocatedStockQty = result.reduce((sum, item) => sum + item.stockQty, 0)
  if (Math.abs(allocatedStockQty - input.stockQty) > tolerance) throw new Error('业务批次分配数量与库存出库数量不一致')
  const recordedValuationQty = result.reduce((sum, item) => sum + Math.abs(Number(item.transaction.valuationQty)), 0)
  const recordedCostAmount = result.reduce((sum, item) => sum + Math.abs(Number(item.transaction.costAmount)), 0)
  if (
    Math.abs(recordedValuationQty - input.issueValuationQty) > tolerance
    || Math.abs(recordedCostAmount - input.issueCostAmount) > tolerance
  ) {
    throw new Error('业务批次估值与正式库存出库流水不一致')
  }
  return result
}

export async function restoreInventoryLotsForReference(
  tx: Prisma.TransactionClient,
  input: {
    originalRefType: string
    originalRefId: string
    originalTransactionType: string
    originalStockLogId: string
    reversalRefType: string
    reversalRefId: string
    reversalTransactionType: string
    idempotencyPrefix: string
    note: string
    stockLogId: string
    createdBy?: string | null
    missingMessage?: string
  },
) {
  const originalTransactions = await tx.inventoryLotTransaction.findMany({
    where: {
      refType: input.originalRefType,
      refId: input.originalRefId,
      type: input.originalTransactionType,
      stockQty: { lt: -tolerance },
    },
    include: { lot: true },
    orderBy: { createdAt: 'asc' },
  })
  if (originalTransactions.length === 0) {
    throw new Error(input.missingMessage || '原批次事务缺失，不能建立可信批次恢复')
  }

  for (const transaction of originalTransactions) {
    if (
      transaction.lot.status !== 'OPEN'
      || transaction.fromStatus !== 'AVAILABLE'
      || transaction.locationId.length === 0
      || transaction.stockLogId !== input.originalStockLogId
    ) {
      throw new Error('原批次事务与正式耗用流水不一致，不能建立可信批次恢复')
    }
    const reversalKey = `${input.idempotencyPrefix}:LOT_TRANSACTION:${transaction.id}`
    if (await tx.inventoryLotTransaction.findUnique({ where: { idempotencyKey: reversalKey } })) {
      throw new Error('原批次事务已经恢复，不能重复冲销')
    }
  }

  const restored = []
  for (const transaction of originalTransactions) {
    const stockQty = Math.abs(Number(transaction.stockQty))
    const valuationQty = Math.abs(Number(transaction.valuationQty))
    const costAmount = Math.abs(Number(transaction.costAmount))
    await tx.inventoryLotBalance.upsert({
      where: {
        lotId_locationId_inventoryStatus: {
          lotId: transaction.lotId,
          locationId: transaction.locationId,
          inventoryStatus: 'AVAILABLE',
        },
      },
      update: {
        stockQty: { increment: stockQty },
        valuationQty: { increment: valuationQty },
        costAmount: { increment: costAmount },
      },
      create: {
        lotId: transaction.lotId,
        locationId: transaction.locationId,
        inventoryStatus: 'AVAILABLE',
        stockQty,
        valuationQty,
        costAmount,
      },
    })
    restored.push(await tx.inventoryLotTransaction.create({
      data: {
        lotId: transaction.lotId,
        locationId: transaction.locationId,
        type: input.reversalTransactionType,
        toStatus: 'AVAILABLE',
        stockQty,
        valuationQty,
        costAmount,
        refType: input.reversalRefType,
        refId: input.reversalRefId,
        stockLogId: input.stockLogId,
        idempotencyKey: `${input.idempotencyPrefix}:LOT_TRANSACTION:${transaction.id}`,
        note: input.note,
        createdBy: input.createdBy || null,
      },
    }))
  }
  return restored
}

export function distributeIssueValue(total: number, stockQty: number, totalStockQty: number, allocated: number, last: boolean) {
  return last ? roundQty(total - allocated) : roundQty(totalStockQty > tolerance ? total * stockQty / totalStockQty : 0)
}

export async function allocateAvailableInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    actualInputId: string
    materialId: string
    materialCode: string
    locationId: string
    locationCode: string
    stockQty: number
    issueValuationQty: number
    issueCostAmount: number
    stockLogId?: string | null
    createdBy?: string | null
  },
) {
  const existing = await tx.inventoryLotAllocation.findMany({
    where: { actualInputId: input.actualInputId, status: 'ACTIVE' },
    include: { lot: true },
    orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing

  const allocations = await consumeAvailableInventoryLots(tx, input)
  for (const item of allocations) {
    await tx.inventoryLotAllocation.create({
      data: {
        actualInputId: input.actualInputId, lotId: item.lotId, locationId: input.locationId,
        inventoryStatus: 'AVAILABLE', stockQty: item.stockQty,
        valuationQty: item.balanceValuationQty, costAmount: item.balanceCostAmount,
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: item.lotId, locationId: input.locationId, type: 'PRODUCTION_CONSUME', fromStatus: 'AVAILABLE',
        stockQty: -item.stockQty, valuationQty: -item.balanceValuationQty, costAmount: -item.balanceCostAmount,
        refType: 'PRODUCTION_ORDER_ACTUAL_INPUT', refId: input.actualInputId, stockLogId: input.stockLogId || null,
        idempotencyKey: `PRODUCTION_ACTUAL_INPUT:${input.actualInputId}:LOT:${item.lotId}`,
        note: '生产实绩投入批次分配', createdBy: input.createdBy || null,
      },
    })
  }
  return tx.inventoryLotAllocation.findMany({
    where: { actualInputId: input.actualInputId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}
