import type { Prisma } from '@prisma/client'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { getBomStatusRelationFilters } from '@/lib/bom-status-filter'
import { getProductsByMaterialId } from '@/lib/material-product'
import { sortByNaturalText } from '@/lib/natural-sort'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { getSystemSettings } from '@/lib/system-settings'
import type { MaterialAdvancedCondition, MaterialListQuery } from '../contracts/material-schema'
import { materialCategoryFilterOptions } from '../model/material-options'

const materialInclude = {
  stock: {
    select: {
      qty: true, reservedQty: true, availableQty: true, valuationQty: true,
      quarantineQty: true, holdQty: true,
      reservedValuationQty: true, availableValuationQty: true,
      quarantineValuationQty: true, holdValuationQty: true,
      totalCost: true, quarantineCost: true, holdCost: true,
      valuationUnitCost: true, stockUnitCost: true,
    },
  },
  customer: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MaterialInclude

function stringCondition(condition: MaterialAdvancedCondition) {
  if (condition.operator === 'equals') return { equals: condition.value }
  if (condition.operator === 'startsWith') return { startsWith: condition.value }
  return { contains: condition.value }
}

function dateCondition(condition: MaterialAdvancedCondition) {
  const start = new Date(`${condition.value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return null
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  if (condition.operator === 'equals') return { gte: start, lt: next }
  if (condition.operator === 'gt') return { gte: next }
  if (condition.operator === 'gte') return { gte: start }
  if (condition.operator === 'lt') return { lt: start }
  if (condition.operator === 'lte') return { lt: next }
  return null
}

function numberCondition(condition: MaterialAdvancedCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return null
  if (condition.operator === 'gt') return { gt: value }
  if (condition.operator === 'gte') return { gte: value }
  if (condition.operator === 'lt') return { lt: value }
  if (condition.operator === 'lte') return { lte: value }
  return { equals: value }
}

function buildMaterialWhere(query: MaterialListQuery): Prisma.MaterialWhereInput {
  const where: Prisma.MaterialWhereInput = { deletedAt: null }
  const andFilters: Prisma.MaterialWhereInput[] = []
  if (query.categories.length === 1) where.category = query.categories[0]
  else if (query.categories.length > 1) where.category = { in: query.categories }
  else if (query.category) where.category = query.category
  if (query.customerId === '__UNASSIGNED__') where.customerId = null
  else if (query.customerId) where.customerId = query.customerId
  andFilters.push(...getBomStatusRelationFilters(query.bomStatus) as Prisma.MaterialWhereInput[])
  for (const condition of query.advancedConditions) {
    if (['code', 'name', 'spec', 'unit', 'stockUnit', 'valuationUnit', 'conversionNote', 'note'].includes(condition.field)) {
      andFilters.push({ [condition.field]: stringCondition(condition) } as Prisma.MaterialWhereInput)
    } else if (['category', 'primaryMeasure', 'referenceMeasure', 'costingMethod', 'salesCurrency'].includes(condition.field)) {
      andFilters.push({ [condition.field]: condition.value } as Prisma.MaterialWhereInput)
    } else if (condition.field === 'customerId') {
      andFilters.push({ customerId: condition.value === '__UNASSIGNED__' ? null : condition.value })
    } else if (condition.field === 'bomStatus') {
      andFilters.push(...getBomStatusRelationFilters(condition.value) as Prisma.MaterialWhereInput[])
    } else if (condition.field === 'createdAt') {
      const filter = dateCondition(condition)
      if (filter) andFilters.push({ createdAt: filter })
    } else if (condition.field === 'conversionRate' || condition.field === 'defaultSalePrice') {
      const filter = numberCondition(condition)
      if (filter) andFilters.push({ [condition.field]: filter } as Prisma.MaterialWhereInput)
    } else if (['stockQty', 'availableQty', 'valuationQty', 'totalCost'].includes(condition.field)) {
      const filter = numberCondition(condition)
      const stockField = condition.field === 'stockQty' ? 'qty' : condition.field
      if (filter) andFilters.push({ stock: { is: { [stockField]: filter } } } as Prisma.MaterialWhereInput)
    }
  }
  andFilters.push(...tokenizeKeywordQuery(query.keyword).map((token) => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return ({ OR: [
    { name: { contains: token } }, { code: { contains: token } }, { spec: { contains: token } }, { note: { contains: token } },
    { unit: { contains: token } }, { stockUnit: { contains: token } }, { valuationUnit: { contains: token } },
    { conversionNote: { contains: token } }, { salesCurrency: { contains: token } },
    { customer: { is: { code: { contains: token } } } }, { customer: { is: { name: { contains: token } } } },
    ...materialCategoryFilterOptions.filter((option) => option.label.includes(token)).map((option) => ({ category: option.value })),
    ...[{ value: 'LENGTH', label: '长度' }, { value: 'WEIGHT', label: '重量' }, { value: 'QUANTITY', label: '数量' }, { value: 'OTHER', label: '其他' }].filter((option) => option.label.includes(token)).flatMap((option) => [{ primaryMeasure: option.value }, { referenceMeasure: option.value }]),
    ...[{ value: 'WEIGHTED_AVERAGE', label: '加权平均' }, { value: 'FIFO', label: '先进先出' }].filter((option) => option.label.includes(token)).map((option) => ({ costingMethod: option.value })),
    ...('人民币'.includes(token) ? [{ salesCurrency: 'CNY' }] : []),
    ...(Number.isFinite(number) ? [{ conversionRate: number }, { defaultSalePrice: number }, { stock: { is: { OR: [{ qty: number }, { availableQty: number }, { valuationQty: number }, { totalCost: number }] } } }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ createdAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }) }))
  if (andFilters.length > 0) where.AND = andFilters
  return where
}

function materialOrderBy(query: MaterialListQuery): Prisma.MaterialOrderByWithRelationInput | undefined {
  if (query.sortBy === 'customer') return { customer: { name: query.sortDir } }
  if (query.sortBy === 'stock') return { stock: { qty: query.sortDir } }
  if (query.sortBy === 'valuationStock') return { stock: { valuationQty: query.sortDir } }
  if (query.sortBy === 'bomSummary') return undefined
  return { [query.sortBy]: query.sortDir }
}

async function listByBomSummary(query: MaterialListQuery, where: Prisma.MaterialWhereInput) {
  const [sortableMaterials, bomProducts] = await Promise.all([
    prisma.material.findMany({ where, select: { id: true, code: true } }),
    prisma.product.findMany({
      orderBy: { createdAt: 'desc' }, take: 500,
      select: { id: true, materialId: true, sku: true, boms: { orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { createdAt: 'desc' }], select: {
        isActive: true, isDefault: true,
        items: { where: { itemType: 'MATERIAL', materialId: { not: null } }, select: { materialId: true } },
      } } },
    }),
  ])
  const summaryCountByMaterialId = new Map<string, number>()
  const productByMaterialId = await getProductsByMaterialId(prisma, bomProducts)
  for (const material of sortableMaterials) {
    const product = productByMaterialId.get(material.id)
    const bom = product?.boms.find((item) => item.isActive && item.isDefault)
      || product?.boms.find((item) => item.isActive) || product?.boms[0]
    if (!bom) continue
    summaryCountByMaterialId.set(material.id, (summaryCountByMaterialId.get(material.id) || 0) + bom.items.length)
    for (const item of bom.items) {
      if (item.materialId) summaryCountByMaterialId.set(item.materialId, (summaryCountByMaterialId.get(item.materialId) || 0) + 1)
    }
  }
  const direction = query.sortDir === 'asc' ? 1 : -1
  const sortedIds = sortableMaterials
    .sort((left, right) => (((summaryCountByMaterialId.get(left.id) || 0) - (summaryCountByMaterialId.get(right.id) || 0)) * direction)
      || left.code.localeCompare(right.code, 'zh-CN', { numeric: true, sensitivity: 'base' }))
    .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    .map((material) => material.id)
  const rows = sortedIds.length === 0 ? [] : await prisma.material.findMany({ where: { id: { in: sortedIds } }, include: materialInclude })
  const byId = new Map(rows.map((material) => [material.id, material]))
  return { materials: sortedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []), total: sortableMaterials.length }
}

export async function listMaterials(query: MaterialListQuery) {
  const where = buildMaterialWhere(query)
  let materials
  let total
  if (query.sortBy === 'bomSummary') {
    ;({ materials, total } = await listByBomSummary(query, where))
  } else {
    const naturalCodeSortEnabled = query.sortBy === 'code' && (await getSystemSettings()).naturalMaterialCodeSortEnabled
    const [rows, count] = await Promise.all([
      prisma.material.findMany({
        where, include: materialInclude,
        ...(naturalCodeSortEnabled ? {} : { skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: materialOrderBy(query) }),
      }),
      prisma.material.count({ where }),
    ])
    materials = naturalCodeSortEnabled
      ? sortByNaturalText(rows, (material) => material.code, query.sortDir).slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      : rows
    total = count
  }

  const materialIds = materials.map((material) => material.id)
  const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
    where: { ownerType: 'MATERIAL', ownerId: { in: materialIds }, documentType: 'MATERIAL_IMAGE', mimeType: { startsWith: 'image/' }, deletedAt: null },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
  })
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  return {
    data: materials.map((material) => {
      const image = primaryImageByMaterial.get(material.id)
      return { ...material, primaryImage: image ? withMaterialImageUrls(image) : null }
    }),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  }
}
