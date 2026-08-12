import type { Prisma } from '@prisma/client'
import { inventoryStatusLabel, type InventoryStatus } from '../domain/inventory-status'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001

function statusStockField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineQty' as const
  if (status === 'HOLD') return 'holdQty' as const
  if (status === 'REWORK') return 'reworkQty' as const
  return 'availableQty' as const
}

function statusValuationField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineValuationQty' as const
  if (status === 'HOLD') return 'holdValuationQty' as const
  if (status === 'REWORK') return 'reworkValuationQty' as const
  return 'availableValuationQty' as const
}

function statusCostField(status: InventoryStatus) {
  if (status === 'QUARANTINE') return 'quarantineCost' as const
  if (status === 'HOLD') return 'holdCost' as const
  if (status === 'REWORK') return 'reworkCost' as const
  return null
}

async function transitionLotCostLayers(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string
    fromStatus: InventoryStatus
    toStatus: InventoryStatus
    stockQty: number
    sourceStockQty: number
  },
) {
  if (Math.abs(input.stockQty - input.sourceStockQty) <= tolerance) {
    await tx.inventoryCostLayer.updateMany({
      where: { lotId: input.lotId, inventoryStatus: input.fromStatus, remainingStockQty: { gt: tolerance } },
      data: { inventoryStatus: input.toStatus },
    })
    return
  }

  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      lotId: input.lotId,
      inventoryStatus: input.fromStatus,
      remainingStockQty: { gt: tolerance },
      status: 'OPEN',
    },
    orderBy: { createdAt: 'asc' },
  })
  let remaining = roundQty(input.stockQty)
  for (const layer of layers) {
    if (remaining <= tolerance) break
    const layerQty = Number(layer.remainingStockQty)
    const movedQty = roundQty(Math.min(layerQty, remaining))
    const ratio = layerQty > tolerance ? movedQty / layerQty : 0
    const movedValuationQty = roundQty(Number(layer.remainingValuationQty) * ratio)
    const movedAmount = roundQty(Number(layer.remainingAmount) * ratio)
    const nextQty = Math.max(0, roundQty(layerQty - movedQty))
    const nextValuationQty = Math.max(0, roundQty(Number(layer.remainingValuationQty) - movedValuationQty))
    const nextAmount = Math.max(0, roundQty(Number(layer.remainingAmount) - movedAmount))
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: {
        stockQty: Math.max(0, roundQty(Number(layer.stockQty) - movedQty)),
        remainingStockQty: nextQty,
        valuationQty: Math.max(0, roundQty(Number(layer.valuationQty) - movedValuationQty)),
        remainingValuationQty: nextValuationQty,
        totalAmount: Math.max(0, roundQty(Number(layer.totalAmount) - movedAmount)),
        remainingAmount: nextAmount,
        status: nextQty <= tolerance ? 'CLOSED' : 'OPEN',
      },
    })
    await tx.inventoryCostLayer.create({
      data: {
        materialId: layer.materialId,
        materialInId: layer.materialInId,
        sourceType: layer.sourceType,
        sourceId: layer.sourceId,
        stockQty: movedQty,
        remainingStockQty: movedQty,
        valuationQty: movedValuationQty,
        remainingValuationQty: movedValuationQty,
        stockUnit: layer.stockUnit,
        valuationUnit: layer.valuationUnit,
        valuationUnitCost: layer.valuationUnitCost,
        stockUnitCost: movedQty > tolerance ? movedAmount / movedQty : layer.stockUnitCost,
        totalAmount: movedAmount,
        remainingAmount: movedAmount,
        inventoryStatus: input.toStatus,
        lotId: layer.lotId,
      },
    })
    remaining = roundQty(remaining - movedQty)
  }
  if (remaining > tolerance) throw new Error('批次成本层数量不足，不能拆分质量状态')
}

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

type ConsumedInventoryLot = InventoryLotIssueAllocation & {
  balanceValuationQty: number
  balanceCostAmount: number
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

async function consumeAvailableInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    materialCode: string
    locationId: string
    locationCode: string
    stockQty: number
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

function distributeIssueValue(total: number, stockQty: number, totalStockQty: number, allocated: number, last: boolean) {
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

export async function allocateShipmentInventoryLots(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
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
  const existing = await tx.shipmentLotAllocation.findMany({
    where: { shipmentId: input.shipmentId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
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
        shipmentId: input.shipmentId, lotId: item.lotId, locationId: input.locationId,
        inventoryStatus: 'AVAILABLE', stockQty: item.stockQty, valuationQty, costAmount,
      },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: item.lotId, locationId: input.locationId, type: 'SHIPMENT_OUT', fromStatus: 'AVAILABLE',
        stockQty: -item.stockQty, valuationQty: -item.balanceValuationQty, costAmount: -item.balanceCostAmount,
        refType: 'SHIPMENT', refId: input.shipmentId, stockLogId: input.stockLogId || null,
        idempotencyKey: `SHIPMENT:${input.shipmentId}:LOT:${item.lotId}`,
        note: '发货单内部批次分配', createdBy: input.createdBy || null,
      },
    })
  }
  const allocatedStockQty = consumed.reduce((sum, item) => sum + item.stockQty, 0)
  if (Math.abs(allocatedStockQty - input.stockQty) > tolerance) throw new Error('发货批次分配数量与库存出库数量不一致')
  return tx.shipmentLotAllocation.findMany({
    where: { shipmentId: input.shipmentId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}

export async function createHistoricalShipmentLotAllocation(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string
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
    where: { shipmentId: input.shipmentId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
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
      shipmentId: input.shipmentId, lotId: lot.id, locationId: input.locationId,
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
      idempotencyKey: `LEGACY_SHIPMENT:${input.shipmentId}:LOT`,
      note: `历史发货单 ${input.shipmentNo} 未记录真实内部批次，仅作显式兼容`, createdBy: input.createdBy || null,
    },
  })
  await tx.shipment.update({ where: { id: input.shipmentId }, data: { lotTraceStatus: 'LEGACY' } })
  return tx.shipmentLotAllocation.findMany({
    where: { shipmentId: input.shipmentId, status: 'ACTIVE' }, include: { lot: true }, orderBy: { createdAt: 'asc' },
  })
}

export async function allocateReturnToShipmentLots(
  tx: Prisma.TransactionClient,
  input: {
    returnOrderId: string
    shipmentId: string
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
    where: { shipmentId: input.shipmentId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
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
    stockQty?: number
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
  const sourceStockQty = roundQty(Number(source.stockQty))
  const stockQty = roundQty(input.stockQty ?? sourceStockQty)
  if (!Number.isFinite(stockQty) || stockQty <= tolerance || stockQty > sourceStockQty + tolerance) {
    throw new Error(`批次 ${lot.lotNo} 的状态转换数量无效`)
  }
  const ratio = sourceStockQty > tolerance ? stockQty / sourceStockQty : 0
  const valuationQty = roundQty(Number(source.valuationQty) * ratio)
  const costAmount = roundQty(Number(source.costAmount) * ratio)
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
    data: {
      stockQty: Math.max(0, roundQty(sourceStockQty - stockQty)),
      valuationQty: Math.max(0, roundQty(Number(source.valuationQty) - valuationQty)),
      costAmount: Math.max(0, roundQty(Number(source.costAmount) - costAmount)),
    },
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
  await transitionLotCostLayers(tx, {
    lotId: lot.id,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    stockQty,
    sourceStockQty,
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

export async function scrapInventoryLotQuantity(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string
    fromStatus: InventoryStatus
    stockQty: number
    refType: string
    refId: string
    idempotencyKey: string
    note: string
    createdBy: string
  },
) {
  const existing = await tx.inventoryLotTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { transaction: existing, duplicate: true }
  const lot = await tx.inventoryLot.findUnique({ where: { id: input.lotId }, include: { balances: true } })
  if (!lot || lot.status !== 'OPEN') throw new Error('内部批次不存在或已冲销')
  const sourceBalances = lot.balances.filter((item) => item.inventoryStatus === input.fromStatus && Number(item.stockQty) > tolerance)
  if (sourceBalances.length !== 1) throw new Error(`批次 ${lot.lotNo} 没有唯一的${inventoryStatusLabel(input.fromStatus)}余额`)
  const source = sourceBalances[0]
  const sourceQty = Number(source.stockQty)
  const stockQty = roundQty(input.stockQty)
  if (!Number.isFinite(stockQty) || stockQty <= tolerance || stockQty > sourceQty + tolerance) throw new Error('报废数量无效')
  const ratio = stockQty / sourceQty
  const valuationQty = roundQty(Number(source.valuationQty) * ratio)
  const costAmount = roundQty(Number(source.costAmount) * ratio)
  const stock = await tx.stock.findUniqueOrThrow({ where: { materialId: lot.materialId } })
  const statusQtyField = statusStockField(input.fromStatus)
  const statusValuationQtyField = statusValuationField(input.fromStatus)
  const statusCostAmountField = statusCostField(input.fromStatus)
  if (Number(stock[statusQtyField]) + tolerance < stockQty) throw new Error('报废批次状态库存不足')
  const afterQty = Math.max(0, roundQty(Number(stock.qty) - stockQty))
  const afterValuationQty = Math.max(0, roundQty(Number(stock.valuationQty) - valuationQty))
  const afterCostAmount = Math.max(0, roundQty(Number(stock.totalCost) - costAmount))
  const stockData: Prisma.StockUpdateInput = {
    qty: afterQty,
    valuationQty: afterValuationQty,
    totalCost: afterCostAmount,
    [statusQtyField]: { decrement: stockQty },
    [statusValuationQtyField]: { decrement: valuationQty },
    valuationUnitCost: afterValuationQty > tolerance ? afterCostAmount / afterValuationQty : 0,
    stockUnitCost: afterQty > tolerance ? afterCostAmount / afterQty : 0,
  }
  if (statusCostAmountField) stockData[statusCostAmountField] = { decrement: costAmount }
  await tx.stock.update({ where: { id: stock.id }, data: stockData })
  const location = await tx.stockLocationBalance.findUniqueOrThrow({
    where: { stockId_locationId: { stockId: stock.id, locationId: source.locationId } },
  })
  if (Number(location[statusQtyField]) + tolerance < stockQty) throw new Error('报废批次库位状态库存不足')
  await tx.stockLocationBalance.update({
    where: { id: location.id },
    data: { qty: { decrement: stockQty }, [statusQtyField]: { decrement: stockQty } },
  })
  await tx.inventoryLotBalance.update({
    where: { id: source.id },
    data: {
      stockQty: Math.max(0, roundQty(sourceQty - stockQty)),
      valuationQty: Math.max(0, roundQty(Number(source.valuationQty) - valuationQty)),
      costAmount: Math.max(0, roundQty(Number(source.costAmount) - costAmount)),
    },
  })
  let remaining = stockQty
  const layers = await tx.inventoryCostLayer.findMany({
    where: { lotId: lot.id, inventoryStatus: input.fromStatus, remainingStockQty: { gt: tolerance } },
    orderBy: { createdAt: 'asc' },
  })
  for (const layer of layers) {
    if (remaining <= tolerance) break
    const layerQty = Number(layer.remainingStockQty)
    const removedQty = roundQty(Math.min(layerQty, remaining))
    const layerRatio = layerQty > tolerance ? removedQty / layerQty : 0
    const removedValuationQty = roundQty(Number(layer.remainingValuationQty) * layerRatio)
    const removedAmount = roundQty(Number(layer.remainingAmount) * layerRatio)
    const nextQty = Math.max(0, roundQty(layerQty - removedQty))
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: {
        remainingStockQty: nextQty,
        remainingValuationQty: Math.max(0, roundQty(Number(layer.remainingValuationQty) - removedValuationQty)),
        remainingAmount: Math.max(0, roundQty(Number(layer.remainingAmount) - removedAmount)),
        status: nextQty <= tolerance ? 'SCRAPPED' : 'OPEN',
      },
    })
    remaining = roundQty(remaining - removedQty)
  }
  if (remaining > tolerance) throw new Error('报废批次成本层数量不足')
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: source.locationId,
      type: 'QUALITY_SCRAP',
      qty: -stockQty,
      beforeQty: Number(stock.qty),
      afterQty,
      valuationQty: -valuationQty,
      beforeValuationQty: Number(stock.valuationQty),
      afterValuationQty,
      costAmount: -costAmount,
      beforeCostAmount: Number(stock.totalCost),
      afterCostAmount,
      lotId: lot.id,
      inventoryStatus: input.fromStatus,
      fromInventoryStatus: input.fromStatus,
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: `${input.idempotencyKey}:STOCK`,
      note: input.note,
      createdBy: input.createdBy,
    },
  })
  const transaction = await tx.inventoryLotTransaction.create({
    data: {
      lotId: lot.id,
      locationId: source.locationId,
      type: 'QUALITY_SCRAP',
      fromStatus: input.fromStatus,
      stockQty: -stockQty,
      valuationQty: -valuationQty,
      costAmount: -costAmount,
      refType: input.refType,
      refId: input.refId,
      stockLogId: movement.id,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
      createdBy: input.createdBy,
    },
  })
  return { transaction, movement, stockQty, valuationQty, costAmount, duplicate: false }
}
