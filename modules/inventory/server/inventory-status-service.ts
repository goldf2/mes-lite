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
    productionOutputId?: string | null
    sourceType: string
    sourceId: string
    supplierLotNo?: string | null
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
      productionOutputId: input.productionOutputId || null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      supplierLotNo: input.supplierLotNo || null,
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
