import type { Prisma } from '@prisma/client'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { buildPackagingInventoryAnalysis } from '@/lib/packaging-inventory'
import { prisma } from '@/lib/prisma'
import { matchesKeywordValues } from '@/lib/resource-search'
import type { StockListQuery } from '../contracts/stock-route'
import { hasStockBalance, STOCK_BALANCE_TOLERANCE } from '../domain/stock-integrity'
import {
  findStockIntegrityIssues,
  StockIntegrityError,
} from './stock-integrity-service'
import { stockDataScopeWhere, type EffectiveDataScope } from '@/modules/identity-access'

const stockInclude = {
  material: {
    select: {
      id: true, code: true, name: true, spec: true, category: true,
      customerId: true, customer: { select: { id: true, code: true, name: true } },
      unit: true, stockUnit: true, valuationUnit: true, conversionRate: true, deletedAt: true,
    },
  },
  product: {
    select: {
      id: true, sku: true, name: true, category: true,
      customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true,
    },
  },
  locationBalances: {
    include: { location: { select: { id: true, code: true, name: true, isActive: true } } },
    orderBy: { location: { code: 'asc' as const } },
  },
} satisfies Prisma.StockInclude

function buildStockWhere(query: StockListQuery): Prisma.StockWhereInput {
  const where: Prisma.StockWhereInput = {}
  const materialWhere: Prisma.MaterialWhereInput = {}
  const productWhere: Prisma.ProductWhereInput = {}
  if (query.type === 'material') where.materialId = { not: null }
  if (query.type === 'product') where.productId = { not: null }
  if (query.categories.length === 1) materialWhere.category = query.categories[0]
  else if (query.categories.length > 1) materialWhere.category = { in: query.categories }
  else if (query.category) materialWhere.category = query.category
  if (query.customerId === '__UNASSIGNED__') {
    materialWhere.customerId = null
    productWhere.customerId = null
  } else if (query.customerId) {
    materialWhere.customerId = query.customerId
    productWhere.customerId = query.customerId
  }
  if (query.locationId) {
    where.locationBalances = { some: {
      locationId: query.locationId,
      OR: [{ qty: { gt: STOCK_BALANCE_TOLERANCE } }, { reservedQty: { gt: STOCK_BALANCE_TOLERANCE } }],
    } }
  }

  const hasMaterialFilter = Object.keys(materialWhere).length > 0
  const hasProductFilter = Object.keys(productWhere).length > 0
  if (query.type === 'material' && hasMaterialFilter) where.material = { is: materialWhere }
  else if (query.type === 'product' && hasProductFilter) where.product = { is: productWhere }
  else if (hasMaterialFilter && hasProductFilter && !query.category && query.categories.length === 0) {
    where.OR = [{ material: { is: materialWhere } }, { product: { is: productWhere } }]
  } else if (hasMaterialFilter) where.material = { is: materialWhere }
  else if (hasProductFilter) where.product = { is: productWhere }
  return where
}

async function loadMaterialImages(materialIds: string[]) {
  const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'MATERIAL', ownerId: { in: materialIds }, documentType: 'MATERIAL_IMAGE',
      mimeType: { startsWith: 'image/' }, deletedAt: null,
    },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
  })
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  return primaryImageByMaterial
}

async function loadPackagingInventory() {
  const packagingBoms = await prisma.bOM.findMany({
    where: { purpose: 'PACKAGING', status: 'RELEASED', isDefault: true },
    select: {
      id: true, name: true, version: true,
      outputs: {
        where: { isPrimary: true }, take: 1,
        select: { quantity: true, material: { select: { id: true, code: true, name: true, category: true, stockUnit: true } } },
      },
      items: {
        where: { itemType: 'MATERIAL' },
        select: { quantity: true, material: { select: { id: true, code: true, name: true, category: true, stockUnit: true } } },
      },
    },
  })
  const relations = packagingBoms.flatMap((bom) => {
    const output = bom.outputs[0]
    const items = bom.items.filter((item) => item.material)
    if (!output || items.length === 0) return []
    return [{
      id: bom.id, name: bom.name, version: bom.version,
      output: { quantity: Number(output.quantity), material: output.material },
      items: items.map((item) => ({ quantity: Number(item.quantity), material: item.material! })),
    }]
  })
  const materialIds = relations.map((relation) => relation.output.material.id)
  const packagedStocks = materialIds.length === 0 ? [] : await prisma.stock.findMany({
    where: { materialId: { in: materialIds } },
    select: {
      id: true, qty: true,
      material: { select: { id: true, code: true, name: true, category: true, stockUnit: true } },
      locationBalances: { select: { qty: true, location: { select: { id: true, code: true, name: true } } } },
    },
  })
  return buildPackagingInventoryAnalysis(
    relations,
    packagedStocks.flatMap((stock) => stock.material ? [{
      stockId: stock.id,
      material: stock.material,
      qty: Number(stock.qty),
      locations: stock.locationBalances.map((balance) => ({
        locationId: balance.location.id, code: balance.location.code,
        name: balance.location.name, qty: Number(balance.qty),
      })),
    }] : []),
  )
}

function scopedStockProjection<T extends {
  qty: number; reservedQty: number; availableQty: number; quarantineQty: number; holdQty: number; reworkQty: number
  locationBalances: Array<{ locationId: string; qty: number; reservedQty: number; availableQty: number; quarantineQty: number; holdQty: number; reworkQty: number }>
}>(stock: T, scope: EffectiveDataScope) {
  if (scope.inventoryMode === 'ALL') return { ...stock, dataScopeRestricted: false }
  const locationBalances = stock.locationBalances.filter((balance) => scope.locationIds.includes(balance.locationId))
  const sum = (field: 'qty' | 'reservedQty' | 'availableQty' | 'quarantineQty' | 'holdQty' | 'reworkQty') => (
    locationBalances.reduce((total, balance) => total + Number(balance[field] || 0), 0)
  )
  return {
    ...stock,
    qty: sum('qty'), reservedQty: sum('reservedQty'), availableQty: sum('availableQty'),
    quarantineQty: sum('quarantineQty'), holdQty: sum('holdQty'), reworkQty: sum('reworkQty'),
    valuationQty: 0, reservedValuationQty: 0, availableValuationQty: 0,
    quarantineValuationQty: 0, holdValuationQty: 0, reworkValuationQty: 0,
    totalCost: 0, quarantineCost: 0, holdCost: 0, reworkCost: 0,
    valuationUnitCost: 0, stockUnitCost: 0,
    packagingDefinition: null, packagingSummary: null,
    locationBalances,
    dataScopeRestricted: true,
  }
}

export async function listStocks(query: StockListQuery, scope: EffectiveDataScope) {
  const integrityIssues = await findStockIntegrityIssues()
  if (integrityIssues.length > 0) throw new StockIntegrityError(integrityIssues)

  const baseWhere = buildStockWhere(query)
  const stocks = await prisma.stock.findMany({
    where: { AND: [baseWhere, stockDataScopeWhere(scope)] }, include: stockInclude, orderBy: { id: 'asc' },
  })
  const materialIds = stocks.flatMap((stock) => stock.materialId ? [stock.materialId] : [])
  const [primaryImageByMaterial, packagingAnalysis] = await Promise.all([
    loadMaterialImages(materialIds),
    loadPackagingInventory(),
  ])
  const enriched = stocks.map((stock) => {
    const image = stock.materialId ? primaryImageByMaterial.get(stock.materialId) : null
    return scopedStockProjection({
      ...stock,
      packagingDefinition: stock.materialId ? packagingAnalysis.definitions.get(stock.materialId) || null : null,
      packagingSummary: stock.materialId ? packagingAnalysis.summaries.get(stock.materialId) || null : null,
      material: stock.material ? { ...stock.material, primaryImage: image ? withMaterialImageUrls(image) : null } : null,
    }, scope)
  })
  const visible = (query.includeInvalid ? enriched : enriched.filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock)))
    .filter((stock) => stock.material || hasStockBalance(stock))
  if (!query.keyword.trim()) return visible
  return visible.filter((stock) => matchesKeywordValues(query.keyword, [
    stock.material?.name, stock.material?.code, stock.material?.spec, stock.material?.customer?.name,
    stock.product?.name, stock.product?.sku, stock.product?.customer?.name,
    ...stock.locationBalances.flatMap((balance) => [balance.location.code, balance.location.name]),
  ]))
}
