import { Prisma } from '@prisma/client'
import { consumeMaterialCost, type CostLayerConsumptionInput } from '@/lib/costing'
import { createInventoryReversalMovement } from '@/lib/inventory-ledger'
import { normalizeConversionRate } from '@/lib/units'

export type ConversionSource =
  | 'MASTER_DEFAULT'
  | 'DOCUMENT_ACTUAL'
  | 'HISTORICAL_ESTIMATE'
  | 'SAME_UNIT'
  | 'STOCK_AVERAGE'
  | 'FIFO_LAYER'
  | 'ORIGINAL_MOVEMENT'
  | 'LEGACY_ESTIMATE'

export const roundQty = (value: number) => Number(value.toFixed(6))
export const tolerance = 0.000001
export const defaultInventoryLocationId = 'default-location'
export type InventoryReceiptStatus = 'AVAILABLE' | 'QUARANTINE' | 'HOLD'

type MaterialPolicy = {
  id: string
  code: string
  name: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  costingMethod: string
}

export async function getMaterialPolicy(tx: Prisma.TransactionClient, materialId: string): Promise<MaterialPolicy> {
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
    quarantineDelta?: number
    holdDelta?: number
    reworkDelta?: number
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
  const quarantineQty = roundQty(Number(current.quarantineQty) + Number(input.quarantineDelta || 0))
  const holdQty = roundQty(Number(current.holdQty) + Number(input.holdDelta || 0))
  const reworkQty = roundQty(Number(current.reworkQty) + Number(input.reworkDelta || 0))
  if (qty < -tolerance || reservedQty < -tolerance || availableQty < -tolerance || quarantineQty < -tolerance || holdQty < -tolerance || reworkQty < -tolerance) {
    throw new Error(
      `库位 ${location.code} ${location.name} 库存不足：可用 ${current.availableQty}，本次变动 ${input.availableDelta ?? input.qtyDelta}`,
    )
  }
  if (Math.abs(availableQty - (qty - reservedQty - quarantineQty - holdQty - reworkQty)) > tolerance) {
    throw new Error(`库位 ${location.code} ${location.name} 的库存、占用、待检、冻结、返工和可用数量不一致`)
  }
  const balance = await tx.stockLocationBalance.update({
    where: { id: current.id },
    data: {
      qty: Math.max(0, qty),
      reservedQty: Math.max(0, reservedQty),
      availableQty: Math.max(0, availableQty),
      quarantineQty: Math.max(0, quarantineQty),
      holdQty: Math.max(0, holdQty),
      reworkQty: Math.max(0, reworkQty),
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
    eligibleStockQty: number
    eligibleValuationQty: number
    eligibleCostAmount: number
  },
) {
  if (material.costingMethod !== 'FIFO' || stock.eligibleStockQty <= tolerance) return
  const aggregate = await tx.inventoryCostLayer.aggregate({
    where: { materialId: material.id, status: 'OPEN', inventoryStatus: 'AVAILABLE' },
    _sum: { remainingStockQty: true },
  })
  const layeredQty = Number(aggregate._sum.remainingStockQty || 0)
  const missingQty = roundQty(stock.eligibleStockQty - layeredQty)
  if (missingQty <= tolerance) return
  const averageRate = stock.eligibleStockQty > 0 ? stock.eligibleValuationQty / stock.eligibleStockQty : material.conversionRate
  const valuationQty = roundQty(missingQty * averageRate)
  const amount = roundQty(missingQty * (stock.eligibleStockQty > 0 ? stock.eligibleCostAmount / stock.eligibleStockQty : stock.stockUnitCost))
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
      inventoryStatus: 'AVAILABLE',
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
    inventoryStatus?: InventoryReceiptStatus
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
  const inventoryStatus = input.inventoryStatus || 'AVAILABLE'
  const { location } = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: input.locationId,
    qtyDelta: quantities.stockQty,
    availableDelta: inventoryStatus === 'AVAILABLE' ? quantities.stockQty : 0,
    quarantineDelta: inventoryStatus === 'QUARANTINE' ? quantities.stockQty : 0,
    holdDelta: inventoryStatus === 'HOLD' ? quantities.stockQty : 0,
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
      availableQty: roundQty(Number(stock.availableQty) + (inventoryStatus === 'AVAILABLE' ? quantities.stockQty : 0)),
      quarantineQty: roundQty(Number(stock.quarantineQty) + (inventoryStatus === 'QUARANTINE' ? quantities.stockQty : 0)),
      holdQty: roundQty(Number(stock.holdQty) + (inventoryStatus === 'HOLD' ? quantities.stockQty : 0)),
      valuationQty: afterValuationQty,
      availableValuationQty: roundQty(Number(stock.availableValuationQty) + (inventoryStatus === 'AVAILABLE' ? quantities.valuationQty : 0)),
      quarantineValuationQty: roundQty(Number(stock.quarantineValuationQty) + (inventoryStatus === 'QUARANTINE' ? quantities.valuationQty : 0)),
      holdValuationQty: roundQty(Number(stock.holdValuationQty) + (inventoryStatus === 'HOLD' ? quantities.valuationQty : 0)),
      totalCost: afterCostAmount,
      quarantineCost: roundQty(Number(stock.quarantineCost) + (inventoryStatus === 'QUARANTINE' ? costAmount : 0)),
      holdCost: roundQty(Number(stock.holdCost) + (inventoryStatus === 'HOLD' ? costAmount : 0)),
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })

  let costLayer = null
  if (input.createCostLayer !== false) {
    costLayer = await tx.inventoryCostLayer.create({
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
        inventoryStatus,
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
      inventoryStatus,
      sourceMovementId: input.sourceMovementId || null,
      idempotencyKey: input.idempotencyKey,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdBy: input.createdBy || null,
    },
  })
  return { movement, costLayer, material, location, quantities, costAmount, inventoryStatus, duplicate: false }
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
    eligibleStockQty: roundQty(Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) - Number(stock.reworkQty)),
    eligibleValuationQty: roundQty(Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty)),
    eligibleCostAmount: roundQty(Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) - Number(stock.reworkCost)),
  })
  const costResult = await consumeMaterialCost(tx, {
    materialId: material.id,
    issueStockQty: issueQty,
    stock: {
      id: stock.id,
      qty: roundQty(Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) - Number(stock.reworkQty)),
      valuationQty: roundQty(Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty)),
      totalCost: roundQty(Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) - Number(stock.reworkCost)),
      valuationUnitCost: Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty) > tolerance
        ? roundQty((Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) - Number(stock.reworkCost)) / (Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty)))
        : 0,
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

export async function reverseInventoryIssue(
  tx: Prisma.TransactionClient,
  input: {
    sourceMovementId: string
    refType: string
    refId: string
    note: string
    createdBy?: string | null
    idempotencyKey: string
    layerConsumptions?: CostLayerConsumptionInput[]
  },
) {
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { movement: existing, duplicate: true }

  const source = await tx.stockLog.findUnique({
    where: { id: input.sourceMovementId },
    include: { stock: { include: { material: true } }, location: true },
  })
  if (!source) throw new Error('原发货库存流水不存在，不能冲销')
  if (source.reversalMovementId) throw new Error('原发货库存流水已经冲销，不能重复冲销')
  if (source.refType !== 'SHIPMENT' || source.type !== 'OUT') throw new Error('所选库存流水不是可冲销的发货出库流水')
  if (!source.locationId || !source.location) throw new Error('原发货库存流水缺少库位，不能冲销')
  if (!source.stock.materialId || !source.stock.material) throw new Error('原发货库存流水缺少物料，不能冲销')

  const stockQty = Math.abs(Number(source.qty))
  const valuationQty = Math.abs(Number(source.valuationQty || 0))
  const costAmount = Math.abs(Number(source.costAmount || 0))
  const stock = source.stock
  const material = source.stock.material
  const materialId = source.stock.materialId
  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const afterQty = roundQty(beforeQty + stockQty)
  const afterValuationQty = roundQty(beforeValuationQty + valuationQty)
  const afterCostAmount = roundQty(beforeCostAmount + costAmount)

  await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: source.locationId,
    qtyDelta: stockQty,
  })
  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundQty(Number(stock.availableQty) + stockQty),
      valuationQty: afterValuationQty,
      availableValuationQty: roundQty(Number(stock.availableValuationQty) + valuationQty),
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })

  const consumptions = input.layerConsumptions || []
  if (source.costingMethodSnapshot === 'FIFO' && consumptions.length > 0) {
    for (const consumption of consumptions) {
      const layer = await tx.inventoryCostLayer.findFirst({
        where: { id: consumption.costLayerId, materialId },
      })
      if (!layer) throw new Error('原发货 FIFO 成本层不存在，不能建立可信冲销')
      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: {
          remainingStockQty: { increment: consumption.stockQty },
          remainingValuationQty: { increment: consumption.valuationQty },
          remainingAmount: { increment: consumption.costAmount },
          status: 'OPEN',
        },
      })
    }
  } else if (source.costingMethodSnapshot === 'FIFO') {
    await tx.inventoryCostLayer.create({
      data: {
        materialId,
        sourceType: input.refType,
        sourceId: input.refId,
        stockQty,
        remainingStockQty: stockQty,
        valuationQty,
        remainingValuationQty: valuationQty,
        stockUnit: source.stockUnitSnapshot || material.stockUnit || material.unit,
        valuationUnit: source.valuationUnitSnapshot || material.valuationUnit || material.unit,
        valuationUnitCost: valuationQty > 0 ? costAmount / valuationQty : 0,
        stockUnitCost: stockQty > 0 ? costAmount / stockQty : 0,
        totalAmount: costAmount,
        remainingAmount: costAmount,
        inventoryStatus: 'AVAILABLE',
      },
    })
  }

  const movement = await createInventoryReversalMovement(tx, source.id, {
    stockId: stock.id,
    locationId: source.locationId,
    type: 'SHIPMENT_REVERSE_IN',
    qty: stockQty,
    beforeQty,
    afterQty,
    valuationQty,
    beforeValuationQty,
    afterValuationQty,
    costAmount,
    beforeCostAmount,
    afterCostAmount,
    stockUnitSnapshot: source.stockUnitSnapshot,
    valuationUnitSnapshot: source.valuationUnitSnapshot,
    conversionRateUsed: source.conversionRateUsed,
    conversionSource: 'ORIGINAL_MOVEMENT',
    costingMethodSnapshot: source.costingMethodSnapshot,
    inventoryStatus: 'AVAILABLE',
    idempotencyKey: input.idempotencyKey,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdBy: input.createdBy || null,
  })
  return { movement, duplicate: false }
}

export function issueInventoryForBusinessReference(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof postInventoryIssue>[1],
) {
  return postInventoryIssue(tx, input)
}
