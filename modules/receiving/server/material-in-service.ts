import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveInventoryLocation } from '@/lib/inventory'
import { normalizeMaterialInPriceUnit, resolveMaterialInPricing, resolveMaterialInStockQuantity } from '@/lib/material-in-quantity'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'
import type { CreateMaterialInInput, MaterialInItemInput } from '../contracts/material-in-schema'

export interface MaterialInListQuery {
  statuses: string[]
  keyword?: string | null
  supplierId?: string | null
  customerId?: string | null
  page: number
  pageSize: number
}

export class MaterialInDomainError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
    this.name = 'MaterialInDomainError'
  }
}

function materialInInclude() {
  return {
    supplier: true,
    location: true,
    material: { include: { customer: { select: { id: true, code: true, name: true } } } },
  } satisfies Prisma.MaterialInInclude
}

export async function listMaterialIns(query: MaterialInListQuery) {
  const page = Math.max(1, Number.isFinite(query.page) ? Math.floor(query.page) : 1)
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(query.pageSize) ? Math.floor(query.pageSize) : 20))
  const where: Prisma.MaterialInWhereInput = { deletedAt: null }
  const andConditions: Prisma.MaterialInWhereInput[] = []
  if (query.statuses.length === 1) where.status = query.statuses[0]
  else if (query.statuses.length > 1) where.status = { in: query.statuses }
  if (query.supplierId) where.supplierId = query.supplierId
  if (query.customerId === '__UNASSIGNED__') andConditions.push({ material: { is: { customerId: null } } })
  else if (query.customerId) andConditions.push({ material: { is: { customerId: query.customerId } } })
  andConditions.push(...tokenizeKeywordQuery(query.keyword || '').map((token) => ({ OR: [
    { inboundNo: { contains: token } },
    { voucherNo: { contains: token } },
    { batchNo: { contains: token } },
    { receivedBy: { contains: token } },
    { note: { contains: token } },
    { supplier: { is: { code: { contains: token } } } },
    { supplier: { is: { name: { contains: token } } } },
    { material: { is: { code: { contains: token } } } },
    { material: { is: { name: { contains: token } } } },
    { material: { is: { spec: { contains: token } } } },
  ] })))
  if (andConditions.length > 0) where.AND = andConditions

  const [items, total] = await Promise.all([
    prisma.materialIn.findMany({
      where,
      include: materialInInclude(),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.materialIn.count({ where }),
  ])

  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

async function createMaterialInLine(
  tx: Prisma.TransactionClient,
  common: { supplierId: string; voucherNo?: string; receivedBy?: string; note?: string },
  input: MaterialInItemInput,
  inboundNo: string,
) {
  const material = await tx.material.findFirst({ where: { id: input.materialId, deletedAt: null } })
  if (!material) throw new MaterialInDomainError('物料不存在或已归档', 404)

  const location = await resolveInventoryLocation(tx, input.locationId)
  const stockQuantity = resolveMaterialInStockQuantity({
    primaryMeasure: material.primaryMeasure,
    qty: input.qty,
    pieceCount: input.pieceCount,
    stockQtyMode: input.stockQtyMode,
    stockQtyInput: input.stockQtyInput,
    totalLength: input.totalLength,
    totalWeight: input.totalWeight,
  })
  const { qty, pieceCount, stockQtyMode, stockQtyInput, totalLength, totalWeight } = stockQuantity
  const units = resolveMaterialUnits(material)
  const stockUnit = input.unit || units.stockUnit
  const materialUsesDualUnit = units.stockUnit !== units.valuationUnit || units.conversionRate !== 1
  const actualReferenceQty = material.referenceMeasure === 'LENGTH'
    ? totalLength
    : material.referenceMeasure === 'WEIGHT'
      ? totalWeight
      : material.referenceMeasure === 'QUANTITY'
        ? pieceCount
        : input.valuationQty
  const effectiveValuationQty = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0
    ? actualReferenceQty
    : toValuationQty(qty, units.conversionRate)
  const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
  const conversionSource = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0 ? 'DOCUMENT_ACTUAL' : 'MASTER_DEFAULT'
  const valuationUnit = materialUsesDualUnit ? input.valuationUnit || units.valuationUnit : stockUnit
  const requestedPriceBasis = input.priceBasis || 'VALUATION'
  const requestedPriceUnit = normalizeMaterialInPriceUnit(
    input.priceUnit || (requestedPriceBasis === 'VALUATION' ? valuationUnit : stockUnit),
    requestedPriceBasis === 'VALUATION' ? material.referenceMeasure || material.primaryMeasure : material.primaryMeasure,
  )
  const pricing = resolveMaterialInPricing({
    priceUnit: requestedPriceUnit,
    unitPrice: input.unitPrice,
    totalAmount: input.totalAmount,
    totalLength,
    totalWeight,
    pieceCount,
  })
  const valuationUnitCost = effectiveValuationQty > 0 ? Number((pricing.totalAmount / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCost = qty > 0 ? Number((pricing.totalAmount / qty).toFixed(6)) : 0

  return tx.materialIn.create({
    data: {
      inboundNo,
      voucherNo: common.voucherNo?.trim() || null,
      supplierId: common.supplierId,
      materialId: input.materialId,
      locationId: location.id,
      qty,
      unit: stockUnit,
      pieceCount,
      stockQtyMode,
      stockQtyInput,
      totalLength,
      totalWeight,
      valuationQty: effectiveValuationQty,
      valuationUnit,
      conversionRate,
      conversionSource,
      unitPrice: pricing.unitPrice,
      priceBasis: pricing.priceBasis,
      priceUnit: pricing.priceUnit,
      valuationUnitCost,
      stockUnitCost,
      totalAmount: pricing.totalAmount,
      batchNo: input.batchNo,
      receivedBy: common.receivedBy,
      note: common.note,
      status: 'PENDING',
    },
    include: materialInInclude(),
  })
}

export async function createMaterialIns(input: CreateMaterialInInput) {
  const { supplierId, voucherNo, receivedBy, note } = input
  const requestedItems = 'items' in input ? input.items : [input]
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } })
  if (!supplier) throw new MaterialInDomainError('供应商不存在或已归档', 404)

  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const dayStart = new Date(today)
  dayStart.setHours(0, 0, 0, 0)
  const count = await prisma.materialIn.count({ where: { createdAt: { gte: dayStart } } })
  const items = await prisma.$transaction(async (tx) => {
    const created = []
    for (let index = 0; index < requestedItems.length; index += 1) {
      const inboundNo = `IN-${dateStr}-${String(count + index + 1).padStart(3, '0')}`
      created.push(await createMaterialInLine(tx, { supplierId, voucherNo, receivedBy, note }, requestedItems[index], inboundNo))
    }
    return created
  })
  return { first: items[0], items }
}

export async function archiveMaterialIn(id: string) {
  const current = await prisma.materialIn.findUnique({ where: { id } })
  if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
  const updated = await prisma.materialIn.update({ where: { id }, data: { deletedAt: new Date() } })
  return { current, updated }
}
