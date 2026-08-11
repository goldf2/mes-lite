import { Prisma } from '@prisma/client'
import { consumeMaterialCost } from './costing'
import { normalizeConversionRate } from './units'

export type ConversionSource =
  | 'MASTER_DEFAULT'
  | 'DOCUMENT_ACTUAL'
  | 'HISTORICAL_ESTIMATE'
  | 'SAME_UNIT'
  | 'STOCK_AVERAGE'
  | 'FIFO_LAYER'
  | 'ORIGINAL_MOVEMENT'
  | 'LEGACY_ESTIMATE'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001
export const defaultInventoryLocationId = 'default-location'

type MaterialPolicy = {
  id: string
  code: string
  name: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  costingMethod: string
}

async function getMaterialPolicy(tx: Prisma.TransactionClient, materialId: string): Promise<MaterialPolicy> {
  const material = await tx.material.findFirst({
    where: { id: materialId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      stockUnit: true,
      valuationUnit: true,
      conversionRate: true,
      costingMethod: true,
    },
  })
  if (!material) throw new Error('物料不存在或已归档')
  return {
    id: material.id,
    code: material.code,
    name: material.name,
    stockUnit: material.stockUnit || material.unit,
    valuationUnit: material.valuationUnit || material.unit,
    conversionRate: normalizeConversionRate(material.conversionRate),
    costingMethod: material.costingMethod,
  }
}

async function getOrCreateStock(tx: Prisma.TransactionClient, materialId: string) {
  return tx.stock.upsert({
    where: { materialId },
    update: {},
    create: { materialId },
  })
}

export async function assertInventoryIssueAvailability(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    stockQty: number
    locationId?: string | null
  },
) {
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0) throw new Error('出库数量必须大于 0')

  const material = await getMaterialPolicy(tx, input.materialId)
  const stock = await tx.stock.findUnique({ where: { materialId: material.id } })
  if (!stock) throw new Error(`物料 ${material.code} ${material.name} 没有库存记录`)

  const issueQty = roundQty(input.stockQty)
  if (Number(stock.availableQty) + tolerance < issueQty) {
    throw new Error(`物料 ${material.code} ${material.name} 库存不足：可用 ${stock.availableQty} ${material.stockUnit}，需 ${issueQty} ${material.stockUnit}`)
  }

  const location = await resolveInventoryLocation(tx, input.locationId)
  const locationBalance = await tx.stockLocationBalance.findUnique({
    where: { stockId_locationId: { stockId: stock.id, locationId: location.id } },
  })
  if (!locationBalance || Number(locationBalance.availableQty) + tolerance < issueQty) {
    throw new Error(
      `物料 ${material.code} ${material.name} 在库位 ${location.code} ${location.name} 库存不足：可用 ${locationBalance?.availableQty || 0} ${material.stockUnit}，需 ${issueQty} ${material.stockUnit}`,
    )
  }

  return { material, stock, issueQty, location, locationBalance }
}

export async function resolveInventoryLocation(
  tx: Pick<Prisma.TransactionClient, 'inventoryLocation'>,
  requestedLocationId?: string | null,
) {
  if (requestedLocationId) {
    const requested = await tx.inventoryLocation.findFirst({
      where: { id: requestedLocationId, isActive: true, deletedAt: null },
    })
    if (!requested) throw new Error('所选库位不存在、已停用或已归档')
    return requested
  }

  const configuredDefault = await tx.inventoryLocation.findFirst({
    where: { isDefault: true, isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (configuredDefault) return configuredDefault

  return tx.inventoryLocation.upsert({
    where: { id: defaultInventoryLocationId },
    update: { isDefault: true, isActive: true, deletedAt: null },
    create: {
      id: defaultInventoryLocationId,
      code: 'DEFAULT',
      name: '默认库位',
      isDefault: true,
      isActive: true,
    },
  })
}

export async function changeStockLocationBalance(
  tx: Prisma.TransactionClient,
  input: {
    stockId: string
    locationId?: string | null
    qtyDelta: number
    reservedDelta?: number
    availableDelta?: number
  },
) {
  const location = await resolveInventoryLocation(tx, input.locationId)
  const current = await tx.stockLocationBalance.upsert({
    where: { stockId_locationId: { stockId: input.stockId, locationId: location.id } },
    update: {},
    create: { stockId: input.stockId, locationId: location.id },
  })
  const qty = roundQty(Number(current.qty) + input.qtyDelta)
  const reservedQty = roundQty(Number(current.reservedQty) + Number(input.reservedDelta || 0))
  const availableQty = roundQty(
    Number(current.availableQty) + (input.availableDelta ?? input.qtyDelta),
  )
  if (qty < -tolerance || reservedQty < -tolerance || availableQty < -tolerance) {
    throw new Error(
      `库位 ${location.code} ${location.name} 库存不足：可用 ${current.availableQty}，本次变动 ${input.availableDelta ?? input.qtyDelta}`,
    )
  }
  if (Math.abs(availableQty - (qty - reservedQty)) > tolerance) {
    throw new Error(`库位 ${location.code} ${location.name} 的库存、占用和可用数量不一致`)
  }
  const balance = await tx.stockLocationBalance.update({
    where: { id: current.id },
    data: {
      qty: Math.max(0, qty),
      reservedQty: Math.max(0, reservedQty),
      availableQty: Math.max(0, availableQty),
    },
  })
  return { location, balance }
}

export function resolveReceiptQuantities(input: {
  stockQty: number
  valuationQty?: number | null
  defaultConversionRate: number
  conversionSource?: ConversionSource
}) {
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0) throw new Error('库存数量必须大于 0')
  const hasActual = Number.isFinite(input.valuationQty) && Number(input.valuationQty) >= 0
  const valuationQty = roundQty(hasActual
    ? Number(input.valuationQty)
    : input.stockQty * normalizeConversionRate(input.defaultConversionRate))
  return {
    stockQty: roundQty(input.stockQty),
    valuationQty,
    conversionRateUsed: valuationQty > 0 ? roundQty(valuationQty / input.stockQty) : 0,
    conversionSource: input.conversionSource || (hasActual ? 'DOCUMENT_ACTUAL' : 'MASTER_DEFAULT') as ConversionSource,
  }
}

async function ensureFifoOpeningLayer(
  tx: Prisma.TransactionClient,
  material: MaterialPolicy,
  stock: {
    qty: number
    valuationQty: number
    totalCost: number
    stockUnitCost: number
    valuationUnitCost: number
  },
) {
  if (material.costingMethod !== 'FIFO' || stock.qty <= tolerance) return
  const aggregate = await tx.inventoryCostLayer.aggregate({
    where: { materialId: material.id, status: 'OPEN' },
    _sum: { remainingStockQty: true },
  })
  const layeredQty = Number(aggregate._sum.remainingStockQty || 0)
  const missingQty = roundQty(stock.qty - layeredQty)
  if (missingQty <= tolerance) return
  const averageRate = stock.qty > 0 ? stock.valuationQty / stock.qty : material.conversionRate
  const valuationQty = roundQty(missingQty * averageRate)
  const amount = roundQty(missingQty * (stock.qty > 0 ? stock.totalCost / stock.qty : stock.stockUnitCost))
  await tx.inventoryCostLayer.create({
    data: {
      materialId: material.id,
      stockQty: missingQty,
      remainingStockQty: missingQty,
      valuationQty,
      remainingValuationQty: valuationQty,
      stockUnit: material.stockUnit,
      valuationUnit: material.valuationUnit,
      valuationUnitCost: valuationQty > 0 ? amount / valuationQty : stock.valuationUnitCost,
      stockUnitCost: missingQty > 0 ? amount / missingQty : stock.stockUnitCost,
      totalAmount: amount,
      remainingAmount: amount,
    },
  })
}

export async function postInventoryReceipt(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    stockQty: number
    valuationQty?: number | null
    conversionSource?: ConversionSource
    costAmount: number
    type: string
    refType: string
    refId: string
    note: string
    createdBy?: string | null
    idempotencyKey?: string
    createCostLayer?: boolean
    materialInId?: string | null
    sourceMovementId?: string | null
    locationId?: string | null
  },
) {
  if (input.idempotencyKey) {
    const existing = await tx.stockLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return { movement: existing, duplicate: true }
  }
  const material = await getMaterialPolicy(tx, input.materialId)
  const quantities = resolveReceiptQuantities({
    stockQty: input.stockQty,
    valuationQty: input.valuationQty,
    defaultConversionRate: material.conversionRate,
    conversionSource: input.conversionSource,
  })
  const costAmount = roundQty(Number(input.costAmount || 0))
  if (costAmount < 0) throw new Error('入库成本不能为负数')
  const stock = await getOrCreateStock(tx, material.id)
  const { location } = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: input.locationId,
    qtyDelta: quantities.stockQty,
  })
  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const afterQty = roundQty(beforeQty + quantities.stockQty)
  const afterValuationQty = roundQty(beforeValuationQty + quantities.valuationQty)
  const afterCostAmount = roundQty(beforeCostAmount + costAmount)

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundQty(Number(stock.availableQty) + quantities.stockQty),
      valuationQty: afterValuationQty,
      availableValuationQty: roundQty(Number(stock.availableValuationQty) + quantities.valuationQty),
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })

  if (input.createCostLayer !== false) {
    await tx.inventoryCostLayer.create({
      data: {
        materialId: material.id,
        materialInId: input.materialInId || null,
        sourceType: input.refType,
        sourceId: input.refId,
        stockQty: quantities.stockQty,
        remainingStockQty: quantities.stockQty,
        valuationQty: quantities.valuationQty,
        remainingValuationQty: quantities.valuationQty,
        stockUnit: material.stockUnit,
        valuationUnit: material.valuationUnit,
        valuationUnitCost: quantities.valuationQty > 0 ? costAmount / quantities.valuationQty : 0,
        stockUnitCost: quantities.stockQty > 0 ? costAmount / quantities.stockQty : 0,
        totalAmount: costAmount,
        remainingAmount: costAmount,
      },
    })
  }

  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: location.id,
      type: input.type,
      qty: quantities.stockQty,
      beforeQty,
      afterQty,
      valuationQty: quantities.valuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: material.stockUnit,
      valuationUnitSnapshot: material.valuationUnit,
      conversionRateUsed: quantities.conversionRateUsed,
      conversionSource: quantities.conversionSource,
      costingMethodSnapshot: material.costingMethod,
      sourceMovementId: input.sourceMovementId || null,
      idempotencyKey: input.idempotencyKey,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdBy: input.createdBy || null,
    },
  })
  return { movement, material, location, quantities, costAmount, duplicate: false }
}

export async function postInventoryIssue(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    stockQty: number
    type: string
    refType: string
    refId: string
    note: string
    createdBy?: string | null
    idempotencyKey?: string
    locationId?: string | null
  },
) {
  if (input.idempotencyKey) {
    const existing = await tx.stockLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return { movement: existing, duplicate: true, layerConsumptions: [] }
  }
  const { material, stock, issueQty, location } = await assertInventoryIssueAvailability(tx, input)
  await ensureFifoOpeningLayer(tx, material, {
    qty: Number(stock.qty),
    valuationQty: Number(stock.valuationQty),
    totalCost: Number(stock.totalCost),
    stockUnitCost: Number(stock.stockUnitCost),
    valuationUnitCost: Number(stock.valuationUnitCost),
  })
  const costResult = await consumeMaterialCost(tx, {
    materialId: material.id,
    issueStockQty: issueQty,
    stock: {
      id: stock.id,
      qty: Number(stock.qty),
      valuationQty: Number(stock.valuationQty),
      totalCost: Number(stock.totalCost),
      valuationUnitCost: Number(stock.valuationUnitCost),
    },
    material: {
      costingMethod: material.costingMethod,
      conversionRate: material.conversionRate,
    },
  })
  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const afterQty = roundQty(beforeQty - issueQty)
  const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - costResult.issueValuationQty))
  const afterCostAmount = Math.max(0, roundQty(beforeCostAmount - costResult.costAmount))

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundQty(Number(stock.availableQty) - issueQty),
      valuationQty: afterValuationQty,
      availableValuationQty: Math.max(0, roundQty(Number(stock.availableValuationQty) - costResult.issueValuationQty)),
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })
  await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: location.id,
    qtyDelta: -issueQty,
  })
  const conversionSource: ConversionSource = material.costingMethod === 'FIFO' ? 'FIFO_LAYER' : 'STOCK_AVERAGE'
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: location.id,
      type: input.type,
      qty: -issueQty,
      beforeQty,
      afterQty,
      valuationQty: -costResult.issueValuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount: -costResult.costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: material.stockUnit,
      valuationUnitSnapshot: material.valuationUnit,
      conversionRateUsed: costResult.issueValuationQty > 0 ? roundQty(costResult.issueValuationQty / issueQty) : 0,
      conversionSource,
      costingMethodSnapshot: material.costingMethod,
      idempotencyKey: input.idempotencyKey,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdBy: input.createdBy || null,
    },
  })
  return {
    movement,
    material,
    location,
    stockQty: issueQty,
    valuationQty: costResult.issueValuationQty,
    conversionRateUsed: costResult.issueValuationQty > 0 ? roundQty(costResult.issueValuationQty / issueQty) : 0,
    conversionSource,
    costAmount: costResult.costAmount,
    layerConsumptions: costResult.layerConsumptions,
    duplicate: false,
  }
}

export async function postInventoryLocationTransfer(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    stockQty: number
    sourceLocationId: string
    targetLocationId: string
    refId: string
    note: string
    createdBy?: string | null
    reverse?: boolean
  },
) {
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0) throw new Error('转移数量必须大于 0')
  if (input.sourceLocationId === input.targetLocationId) throw new Error('来源库位和目标库位不能相同')

  const material = await getMaterialPolicy(tx, input.materialId)
  const stock = await tx.stock.findUnique({ where: { materialId: material.id } })
  if (!stock) throw new Error(`物料 ${material.code} ${material.name} 没有库存记录`)

  const [sourceLocation, targetLocation] = await Promise.all([
    resolveInventoryLocation(tx, input.sourceLocationId),
    resolveInventoryLocation(tx, input.targetLocationId),
  ])
  const transferQty = roundQty(input.stockQty)
  const sourceBalance = await tx.stockLocationBalance.findUnique({
    where: { stockId_locationId: { stockId: stock.id, locationId: sourceLocation.id } },
  })
  if (!sourceBalance || Number(sourceBalance.availableQty) + tolerance < transferQty) {
    throw new Error(
      `物料 ${material.code} ${material.name} 在库位 ${sourceLocation.code} ${sourceLocation.name} 库存不足：可用 ${sourceBalance?.availableQty || 0} ${material.stockUnit}，需 ${transferQty} ${material.stockUnit}`,
    )
  }

  const sourceResult = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: sourceLocation.id,
    qtyDelta: -transferQty,
  })
  const targetResult = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: targetLocation.id,
    qtyDelta: transferQty,
  })

  const totalQty = Number(stock.qty)
  const totalValuationQty = Number(stock.valuationQty)
  const totalCost = Number(stock.totalCost)
  const typePrefix = input.reverse ? 'FLOW_TRANSFER_REVERSE' : 'FLOW_TRANSFER'
  const common = {
    stockId: stock.id,
    beforeQty: totalQty,
    afterQty: totalQty,
    beforeValuationQty: totalValuationQty,
    afterValuationQty: totalValuationQty,
    beforeCostAmount: totalCost,
    afterCostAmount: totalCost,
    stockUnitSnapshot: material.stockUnit,
    valuationUnitSnapshot: material.valuationUnit,
    conversionRateUsed: material.conversionRate,
    conversionSource: 'ORIGINAL_MOVEMENT',
    costingMethodSnapshot: material.costingMethod,
    refType: 'FLOW_TRANSFER',
    refId: input.refId,
    note: input.note,
    createdBy: input.createdBy || null,
  }
  const outgoing = await tx.stockLog.create({
    data: {
      ...common,
      locationId: sourceLocation.id,
      type: `${typePrefix}_OUT`,
      qty: -transferQty,
      valuationQty: 0,
      costAmount: 0,
    },
  })
  const incoming = await tx.stockLog.create({
    data: {
      ...common,
      locationId: targetLocation.id,
      type: `${typePrefix}_IN`,
      qty: transferQty,
      valuationQty: 0,
      costAmount: 0,
      sourceMovementId: outgoing.id,
    },
  })

  return {
    material,
    stock,
    sourceLocation,
    targetLocation,
    sourceBalance: sourceResult.balance,
    targetBalance: targetResult.balance,
    outgoing,
    incoming,
  }
}
