import type { Prisma } from '@prisma/client'
import { inventoryStatusLabel, type InventoryStatus } from '../domain/inventory-status'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001

function statusStockField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineQty' as const
  if (status === 'HOLD') return 'holdQty' as const
  return 'availableQty' as const
}

function statusValuationField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineValuationQty' as const
  if (status === 'HOLD') return 'holdValuationQty' as const
  return 'availableValuationQty' as const
}

function statusCostField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineCost' as const
  if (status === 'HOLD') return 'holdCost' as const
  return null
}

export async function createInventoryLotReceipt(
  tx: Prisma.TransactionClient,
  input: {
    lotNo: string
    materialId: string
    materialInId?: string | null
    productionOutputId?: string | null
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
    idempotencyKey: string
    note?: string | null
    createdBy?: string | null
  },
) {
  return tx.inventoryLot.create({
    data: {
      lotNo: input.lotNo,
      materialId: input.materialId,
      materialInId: input.materialInId || null,
      productionOutputId: input.productionOutputId || null,
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

function legacyLotNo(materialCode: string, locationCode: string) {
  const safeMaterial = materialCode.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'MATERIAL'
  const safeLocation = locationCode.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 24) || 'LOCATION'
  return `LEGACY-${safeMaterial}-${safeLocation}`
}

async function ensureLegacyAvailableLot(
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
  const availableStockQty = roundQty(Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) + Number(input.stockQty))
  const availableValuationQty = roundQty(Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) + Number(input.issueValuationQty))
  const availableCostAmount = roundQty(Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) + Number(input.issueCostAmount))
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
  const allocations: InventoryLotIssueAllocation[] = []
  for (const balance of balances) {
    if (remainingStockQty <= tolerance) break
    const balanceStockQty = Number(balance.stockQty)
    const stockQty = roundQty(Math.min(balanceStockQty, remainingStockQty))
    const ratio = balanceStockQty > tolerance ? stockQty / balanceStockQty : 0
    const valuationQty = roundQty(Number(balance.valuationQty) * ratio)
    const costAmount = roundQty(Number(balance.costAmount) * ratio)
    const afterStockQty = roundQty(balanceStockQty - stockQty)
    const afterValuationQty = Math.max(0, roundQty(Number(balance.valuationQty) - valuationQty))
    const afterCostAmount = Math.max(0, roundQty(Number(balance.costAmount) - costAmount))
    await tx.inventoryLotBalance.update({
      where: { id: balance.id },
      data: { stockQty: afterStockQty, valuationQty: afterValuationQty, costAmount: afterCostAmount },
    })
    const allocation = await tx.inventoryLotAllocation.create({
      data: {
        actualInputId: input.actualInputId, lotId: balance.lotId, locationId: input.locationId,
        inventoryStatus: 'AVAILABLE', stockQty, valuationQty, costAmount,
      },
      include: { lot: true },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: balance.lotId, locationId: input.locationId, type: 'PRODUCTION_CONSUME', fromStatus: 'AVAILABLE',
        stockQty: -stockQty, valuationQty: -valuationQty, costAmount: -costAmount,
        refType: 'PRODUCTION_ORDER_ACTUAL_INPUT', refId: input.actualInputId, stockLogId: input.stockLogId || null,
        idempotencyKey: `PRODUCTION_ACTUAL_INPUT:${input.actualInputId}:LOT:${balance.lotId}`,
        note: '生产实绩投入批次分配', createdBy: input.createdBy || null,
      },
    })
    allocations.push({
      lotId: balance.lotId, lotNo: balance.lot.lotNo, sourceType: balance.lot.sourceType, sourceId: balance.lot.sourceId,
      supplierLotNo: balance.lot.supplierLotNo, locationId: input.locationId, stockQty, valuationQty, costAmount,
    })
    remainingStockQty = roundQty(remainingStockQty - stockQty)
  }
  if (remainingStockQty > tolerance) {
    throw new Error(`物料 ${input.materialCode} 可用批次余额不足：尚缺 ${remainingStockQty}`)
  }

  const allocatedStockQty = allocations.reduce((sum, item) => sum + item.stockQty, 0)
  if (Math.abs(allocatedStockQty - input.stockQty) > tolerance) throw new Error('生产投入批次分配数量与库存出库数量不一致')
  return tx.inventoryLotAllocation.findMany({
    where: { actualInputId: input.actualInputId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}

export async function createProductionLotGenealogies(
  tx: Prisma.TransactionClient,
  input: { actualId: string; outputId: string; childLotId: string },
) {
  const allocations = await tx.inventoryLotAllocation.findMany({
    where: { actualInput: { actualId: input.actualId }, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  })
  for (const allocation of allocations) {
    await tx.inventoryLotGenealogy.upsert({
      where: { inputAllocationId_childLotId: { inputAllocationId: allocation.id, childLotId: input.childLotId } },
      update: { status: 'ACTIVE', reversedAt: null },
      create: {
        inputAllocationId: allocation.id, parentLotId: allocation.lotId, childLotId: input.childLotId,
        actualId: input.actualId, outputId: input.outputId,
      },
    })
  }
}

export async function reverseProductionLotAllocations(
  tx: Prisma.TransactionClient,
  input: { actualId: string; reversedBy: string },
) {
  const allocations = await tx.inventoryLotAllocation.findMany({
    where: { actualInput: { actualId: input.actualId }, status: 'ACTIVE' },
    include: { lot: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const allocation of allocations) {
    if (allocation.lot.status !== 'OPEN') throw new Error(`投入批次 ${allocation.lot.lotNo} 已冲销，不能恢复生产投入`)
    await tx.inventoryLotBalance.upsert({
      where: { lotId_locationId_inventoryStatus: { lotId: allocation.lotId, locationId: allocation.locationId, inventoryStatus: 'AVAILABLE' } },
      update: {
        stockQty: { increment: Number(allocation.stockQty) },
        valuationQty: { increment: Number(allocation.valuationQty) },
        costAmount: { increment: Number(allocation.costAmount) },
      },
      create: {
        lotId: allocation.lotId, locationId: allocation.locationId, inventoryStatus: 'AVAILABLE',
        stockQty: Number(allocation.stockQty), valuationQty: Number(allocation.valuationQty), costAmount: Number(allocation.costAmount),
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: allocation.lotId, locationId: allocation.locationId, type: 'PRODUCTION_REVERSE_CONSUME', toStatus: 'AVAILABLE',
        stockQty: Number(allocation.stockQty), valuationQty: Number(allocation.valuationQty), costAmount: Number(allocation.costAmount),
        refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE', refId: input.actualId,
        idempotencyKey: `PRODUCTION_ACTUAL:${input.actualId}:LOT_RESTORE:${allocation.id}`,
        note: '冲销生产实绩，恢复投入批次余额', createdBy: input.reversedBy,
      },
    })
    await tx.inventoryLotAllocation.update({
      where: { id: allocation.id }, data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: input.reversedBy },
    })
  }
  await tx.inventoryLotGenealogy.updateMany({
    where: { actualId: input.actualId, status: 'ACTIVE' }, data: { status: 'REVERSED', reversedAt: new Date() },
  })
}

export async function transferAvailableInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    materialCode: string
    sourceLocationId: string
    sourceLocationCode: string
    targetLocationId: string
    stockQty: number
    refId: string
    note: string
    createdBy?: string | null
    reverse?: boolean
  },
) {
  await ensureLegacyAvailableLot(tx, {
    materialId: input.materialId,
    locationId: input.sourceLocationId,
    materialCode: input.materialCode,
    locationCode: input.sourceLocationCode,
    stockQty: 0,
    locationStockQtyAdjustment: input.stockQty,
    issueValuationQty: 0,
    issueCostAmount: 0,
    createdBy: input.createdBy,
  })
  const balances = await tx.inventoryLotBalance.findMany({
    where: {
      lot: { materialId: input.materialId, status: 'OPEN' },
      locationId: input.sourceLocationId,
      inventoryStatus: 'AVAILABLE',
      stockQty: { gt: tolerance },
    },
    include: { lot: true },
    orderBy: [{ lot: { receivedAt: 'asc' } }, { createdAt: 'asc' }],
  })
  let remainingStockQty = roundQty(input.stockQty)
  const moved: Array<{ lotId: string; lotNo: string; stockQty: number }> = []
  for (const balance of balances) {
    if (remainingStockQty <= tolerance) break
    const balanceStockQty = Number(balance.stockQty)
    const stockQty = roundQty(Math.min(balanceStockQty, remainingStockQty))
    const ratio = balanceStockQty > tolerance ? stockQty / balanceStockQty : 0
    const valuationQty = roundQty(Number(balance.valuationQty) * ratio)
    const costAmount = roundQty(Number(balance.costAmount) * ratio)
    await tx.inventoryLotBalance.update({
      where: { id: balance.id },
      data: {
        stockQty: roundQty(balanceStockQty - stockQty),
        valuationQty: Math.max(0, roundQty(Number(balance.valuationQty) - valuationQty)),
        costAmount: Math.max(0, roundQty(Number(balance.costAmount) - costAmount)),
      },
    })
    await tx.inventoryLotBalance.upsert({
      where: { lotId_locationId_inventoryStatus: { lotId: balance.lotId, locationId: input.targetLocationId, inventoryStatus: 'AVAILABLE' } },
      update: { stockQty: { increment: stockQty }, valuationQty: { increment: valuationQty }, costAmount: { increment: costAmount } },
      create: { lotId: balance.lotId, locationId: input.targetLocationId, inventoryStatus: 'AVAILABLE', stockQty, valuationQty, costAmount },
    })
    const keyPrefix = input.reverse ? 'FLOW_TRANSFER_REVERSE' : 'FLOW_TRANSFER'
    const transactionData = [
      {
        lotId: balance.lotId, locationId: input.sourceLocationId, type: `${keyPrefix}_OUT`, fromStatus: 'AVAILABLE',
        stockQty: -stockQty, valuationQty: -valuationQty, costAmount: -costAmount, refType: 'FLOW_TRANSFER', refId: input.refId,
        idempotencyKey: `${keyPrefix}:${input.refId}:LOT:${balance.lotId}:OUT`, note: input.note, createdBy: input.createdBy || null,
      },
      {
        lotId: balance.lotId, locationId: input.targetLocationId, type: `${keyPrefix}_IN`, toStatus: 'AVAILABLE',
        stockQty, valuationQty, costAmount, refType: 'FLOW_TRANSFER', refId: input.refId,
        idempotencyKey: `${keyPrefix}:${input.refId}:LOT:${balance.lotId}:IN`, note: input.note, createdBy: input.createdBy || null,
      },
    ]
    for (const data of transactionData) {
      await tx.inventoryLotTransaction.upsert({ where: { idempotencyKey: data.idempotencyKey }, update: {}, create: data })
    }
    moved.push({ lotId: balance.lotId, lotNo: balance.lot.lotNo, stockQty })
    remainingStockQty = roundQty(remainingStockQty - stockQty)
  }
  if (remainingStockQty > tolerance) {
    throw new Error(`物料 ${input.materialCode} 在来源库位的可用批次余额不足：尚缺 ${remainingStockQty}`)
  }
  return moved
}

export async function transitionInventoryLotStatus(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string
    fromStatus: InventoryStatus
    toStatus: InventoryStatus
    type: string
    refType: string
    refId: string
    idempotencyKey: string
    note?: string | null
    createdBy?: string | null
  },
) {
  if (input.fromStatus === input.toStatus) throw new Error('批次库存来源状态和目标状态不能相同')
  const existing = await tx.inventoryLotTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { transaction: existing, duplicate: true }
  const lot = await tx.inventoryLot.findUnique({
    where: { id: input.lotId },
    include: { balances: true, costLayers: true },
  })
  if (!lot || lot.status !== 'OPEN') throw new Error('内部批次不存在或已冲销')
  const sourceBalances = lot.balances.filter((balance) => (
    balance.inventoryStatus === input.fromStatus && Number(balance.stockQty) > tolerance
  ))
  if (sourceBalances.length !== 1) {
    throw new Error(`批次 ${lot.lotNo} 没有唯一的${inventoryStatusLabel(input.fromStatus)}余额，不能转换状态`)
  }
  const source = sourceBalances[0]
  const stockQty = roundQty(Number(source.stockQty))
  const valuationQty = roundQty(Number(source.valuationQty))
  const costAmount = roundQty(Number(source.costAmount))
  const stock = await tx.stock.findUnique({ where: { materialId: lot.materialId } })
  if (!stock) throw new Error(`批次 ${lot.lotNo} 对应库存不存在`)

  const sourceStockField = statusStockField(input.fromStatus)
  const targetStockField = statusStockField(input.toStatus)
  const sourceValuationField = statusValuationField(input.fromStatus)
  const targetValuationField = statusValuationField(input.toStatus)
  if (Number(stock[sourceStockField]) + tolerance < stockQty || Number(stock[sourceValuationField]) + tolerance < valuationQty) {
    throw new Error(`批次 ${lot.lotNo} 的${inventoryStatusLabel(input.fromStatus)}库存余额不足`)
  }

  const stockData: Prisma.StockUpdateInput = {
    [sourceStockField]: { decrement: stockQty },
    [targetStockField]: { increment: stockQty },
    [sourceValuationField]: { decrement: valuationQty },
    [targetValuationField]: { increment: valuationQty },
  }
  const sourceCostField = statusCostField(input.fromStatus)
  const targetCostField = statusCostField(input.toStatus)
  if (sourceCostField) stockData[sourceCostField] = { decrement: costAmount }
  if (targetCostField) stockData[targetCostField] = { increment: costAmount }
  await tx.stock.update({ where: { id: stock.id }, data: stockData })

  const location = await tx.stockLocationBalance.findUnique({
    where: { stockId_locationId: { stockId: stock.id, locationId: source.locationId } },
  })
  if (!location) throw new Error(`批次 ${lot.lotNo} 的库位余额不存在`)
  const locationSourceField = statusStockField(input.fromStatus)
  const locationTargetField = statusStockField(input.toStatus)
  if (Number(location[locationSourceField]) + tolerance < stockQty) {
    throw new Error(`批次 ${lot.lotNo} 的库位${inventoryStatusLabel(input.fromStatus)}余额不足`)
  }
  await tx.stockLocationBalance.update({
    where: { id: location.id },
    data: {
      [locationSourceField]: { decrement: stockQty },
      [locationTargetField]: { increment: stockQty },
    },
  })

  await tx.inventoryLotBalance.update({
    where: { id: source.id },
    data: { stockQty: 0, valuationQty: 0, costAmount: 0 },
  })
  await tx.inventoryLotBalance.upsert({
    where: {
      lotId_locationId_inventoryStatus: {
        lotId: lot.id,
        locationId: source.locationId,
        inventoryStatus: input.toStatus,
      },
    },
    update: {
      stockQty: { increment: stockQty },
      valuationQty: { increment: valuationQty },
      costAmount: { increment: costAmount },
    },
    create: {
      lotId: lot.id,
      locationId: source.locationId,
      inventoryStatus: input.toStatus,
      stockQty,
      valuationQty,
      costAmount,
    },
  })
  await tx.inventoryCostLayer.updateMany({
    where: { lotId: lot.id, inventoryStatus: input.fromStatus },
    data: { inventoryStatus: input.toStatus },
  })

  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: source.locationId,
      type: input.type,
      qty: 0,
      beforeQty,
      afterQty: beforeQty,
      valuationQty: 0,
      beforeValuationQty,
      afterValuationQty: beforeValuationQty,
      costAmount: 0,
      beforeCostAmount,
      afterCostAmount: beforeCostAmount,
      lotId: lot.id,
      inventoryStatus: input.toStatus,
      fromInventoryStatus: input.fromStatus,
      toInventoryStatus: input.toStatus,
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: `${input.idempotencyKey}:STOCK`,
      note: input.note || null,
      createdBy: input.createdBy || null,
    },
  })
  const transaction = await tx.inventoryLotTransaction.create({
    data: {
      lotId: lot.id,
      locationId: source.locationId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      stockQty,
      valuationQty,
      costAmount,
      refType: input.refType,
      refId: input.refId,
      stockLogId: movement.id,
      idempotencyKey: input.idempotencyKey,
      note: input.note || null,
      createdBy: input.createdBy || null,
    },
  })
  return { transaction, movement, duplicate: false }
}
