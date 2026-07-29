import { Prisma } from '@prisma/client'
import { consumeMaterialCost } from './costing'
import { normalizeConversionRate } from './units'

export type ConversionSource =
  | 'MASTER_DEFAULT'
  | 'DOCUMENT_ACTUAL'
  | 'STOCK_AVERAGE'
  | 'FIFO_LAYER'
  | 'ORIGINAL_MOVEMENT'
  | 'LEGACY_ESTIMATE'

const roundQty = (value: number) => Number(value.toFixed(6))
const tolerance = 0.000001

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
  return { movement, material, quantities, costAmount, duplicate: false }
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
  },
) {
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0) throw new Error('出库数量必须大于 0')
  if (input.idempotencyKey) {
    const existing = await tx.stockLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return { movement: existing, duplicate: true, layerConsumptions: [] }
  }
  const material = await getMaterialPolicy(tx, input.materialId)
  const stock = await tx.stock.findUnique({ where: { materialId: material.id } })
  if (!stock) throw new Error(`物料 ${material.code} ${material.name} 没有库存记录`)
  const issueQty = roundQty(input.stockQty)
  if (Number(stock.availableQty) + tolerance < issueQty) {
    throw new Error(`物料 ${material.code} ${material.name} 库存不足：可用 ${stock.availableQty} ${material.stockUnit}，需 ${issueQty} ${material.stockUnit}`)
  }
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
  const conversionSource: ConversionSource = material.costingMethod === 'FIFO' ? 'FIFO_LAYER' : 'STOCK_AVERAGE'
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
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
    stockQty: issueQty,
    valuationQty: costResult.issueValuationQty,
    conversionRateUsed: costResult.issueValuationQty > 0 ? roundQty(costResult.issueValuationQty / issueQty) : 0,
    conversionSource,
    costAmount: costResult.costAmount,
    layerConsumptions: costResult.layerConsumptions,
    duplicate: false,
  }
}
