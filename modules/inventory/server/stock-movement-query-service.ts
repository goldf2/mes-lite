import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import type { StockMovementQuery, StockMovementWorkspace } from '../contracts/stock-movement'
import { stockMovementReferenceOptions, stockMovementTypeOptions } from '../model/stock-movement-view'
import { stockLogDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

function textContains(value: string) {
  return { contains: value }
}

function keywordCondition(term: string): Prisma.StockLogWhereInput {
  return {
    OR: [
      { type: textContains(term) },
      { refType: textContains(term) },
      { refId: textContains(term) },
      { note: textContains(term) },
      { createdBy: textContains(term) },
      { stock: { material: { is: { code: textContains(term) } } } },
      { stock: { material: { is: { name: textContains(term) } } } },
      { stock: { material: { is: { spec: textContains(term) } } } },
      { stock: { product: { is: { sku: textContains(term) } } } },
      { stock: { product: { is: { name: textContains(term) } } } },
      { location: { is: { code: textContains(term) } } },
      { location: { is: { name: textContains(term) } } },
    ],
  }
}

function createdDateRange(value: string) {
  const start = new Date(`${value}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { gte: start, lt: end }
}

function buildStockMovementWhere(query: StockMovementQuery): Prisma.StockLogWhereInput {
  const and: Prisma.StockLogWhereInput[] = tokenizeKeywordQuery(query.keyword).map(keywordCondition)
  if (query.objectCode) and.push({ OR: [
    { stock: { material: { is: { code: textContains(query.objectCode) } } } },
    { stock: { product: { is: { sku: textContains(query.objectCode) } } } },
  ] })
  if (query.objectName) and.push({ OR: [
    { stock: { material: { is: { name: textContains(query.objectName) } } } },
    { stock: { product: { is: { name: textContains(query.objectName) } } } },
  ] })
  if (query.type) and.push({ type: query.type })
  if (query.direction === 'in') and.push({ qty: { gt: 0 } })
  if (query.direction === 'out') and.push({ qty: { lt: 0 } })
  if (query.locationId) and.push({ locationId: query.locationId })
  if (query.refType) and.push({ refType: query.refType })
  if (query.refId) and.push({ refId: textContains(query.refId) })
  if (query.operator) and.push({ createdBy: textContains(query.operator) })
  if (query.note) and.push({ note: textContains(query.note) })
  const dateRange = query.createdDate ? createdDateRange(query.createdDate) : null
  if (dateRange) and.push({ createdAt: dateRange })
  return and.length > 0 ? { AND: and } : {}
}

export async function loadStockMovementWorkspace(query: StockMovementQuery, scope: EffectiveDataScope = unrestrictedDataScope): Promise<StockMovementWorkspace> {
  const where: Prisma.StockLogWhereInput = { AND: [buildStockMovementWhere(query), stockLogDataScopeWhere(scope)] }
  const [rows, total, typeRows, refTypeRows, locations] = await Promise.all([
    prisma.stockLog.findMany({
      where,
      include: {
        stock: {
          select: {
            material: { select: { id: true, code: true, name: true, spec: true } },
            product: { select: { id: true, sku: true, name: true } },
          },
        },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockLog.count({ where }),
    prisma.stockLog.findMany({ where: stockLogDataScopeWhere(scope), distinct: ['type'], select: { type: true }, orderBy: { type: 'asc' } }),
    prisma.stockLog.findMany({ where: { AND: [{ refType: { not: null } }, stockLogDataScopeWhere(scope)] }, distinct: ['refType'], select: { refType: true }, orderBy: { refType: 'asc' } }),
    prisma.inventoryLocation.findMany({ where: { deletedAt: null, ...(scope.inventoryMode === 'LOCATIONS' ? { id: { in: scope.locationIds } } : {}) }, select: { id: true, code: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
  ])
  const items = rows.flatMap((row) => {
    const material = row.stock.material
    const product = row.stock.product
    if (!material && !product) return []
    return [{
      id: row.id,
      stockId: row.stockId,
      type: row.type,
      qty: Number(row.qty),
      beforeQty: Number(row.beforeQty),
      afterQty: Number(row.afterQty),
      valuationQty: row.valuationQty === null ? null : Number(row.valuationQty),
      beforeValuationQty: row.beforeValuationQty === null ? null : Number(row.beforeValuationQty),
      afterValuationQty: row.afterValuationQty === null ? null : Number(row.afterValuationQty),
      costAmount: row.costAmount === null ? null : Number(row.costAmount),
      beforeCostAmount: row.beforeCostAmount === null ? null : Number(row.beforeCostAmount),
      afterCostAmount: row.afterCostAmount === null ? null : Number(row.afterCostAmount),
      stockUnit: row.stockUnitSnapshot || '',
      valuationUnit: row.valuationUnitSnapshot || '',
      refType: row.refType,
      refId: row.refId,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      sourceMovementId: row.sourceMovementId,
      reversalMovementId: row.reversalMovementId,
      object: material
        ? { id: material.id, code: material.code, name: material.name, spec: material.spec || '', kind: 'material' as const }
        : { id: product!.id, code: product!.sku, name: product!.name, spec: '', kind: 'product' as const },
      location: row.location,
    }]
  })
  const typeValues = typeRows.map((item) => item.type)
  const refTypeValues = refTypeRows.flatMap((item) => item.refType ? [item.refType] : [])
  return {
    items,
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    options: {
      types: stockMovementTypeOptions(typeValues),
      refTypes: stockMovementReferenceOptions(refTypeValues),
      locations: locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })),
    },
  }
}
