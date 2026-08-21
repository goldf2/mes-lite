import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'

function textFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}

function numberFilter(condition: ResourceSearchCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return { equals: Number.NaN }
  return condition.operator === 'gt' ? { gt: value } : condition.operator === 'gte' ? { gte: value } : condition.operator === 'lt' ? { lt: value } : condition.operator === 'lte' ? { lte: value } : { equals: value }
}

function dateFilter(condition: ResourceSearchCondition) {
  const start = new Date(`${condition.value}T00:00:00`)
  if (Number.isNaN(start.getTime())) return { equals: new Date(0) }
  const next = new Date(start.getTime() + 86_400_000)
  return condition.operator === 'gt' ? { gte: next } : condition.operator === 'gte' ? { gte: start } : condition.operator === 'lt' ? { lt: start } : condition.operator === 'lte' ? { lt: next } : { gte: start, lt: next }
}

function standardAdvancedWhere(condition: ResourceSearchCondition): Prisma.QualityInspectionStandardWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'code' || condition.field === 'name' || condition.field === 'changeReason' || condition.field === 'createdBy' || condition.field === 'releasedBy' || condition.field === 'obsoleteBy') return { [condition.field]: text }
  if (condition.field === 'materialId') return { materialId: condition.value }
  if (condition.field === 'sourceType' || condition.field === 'samplingMode' || condition.field === 'status') return { [condition.field]: condition.value }
  if (['version', 'sampleValue', 'minSampleQty', 'maxSampleQty'].includes(condition.field)) return { [condition.field]: numberFilter(condition) }
  if (condition.field === 'checkItem') return { items: { some: { OR: [{ name: text }, { method: text }, { acceptanceCriteria: text }] } } }
  if (['releasedAt', 'obsoleteAt', 'createdAt', 'updatedAt'].includes(condition.field)) return { [condition.field]: dateFilter(condition) }
  return { id: '__INVALID_SEARCH_FIELD__' }
}

function standardKeywordWhere(keyword: string): Prisma.QualityInspectionStandardWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [
    { code: { contains: value } }, { name: { contains: value } }, { changeReason: { contains: value } }, { createdBy: { contains: value } }, { releasedBy: { contains: value } }, { obsoleteBy: { contains: value } },
    { material: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { stockUnit: { contains: value } }] } } },
    { items: { some: { OR: [{ name: { contains: value } }, { method: { contains: value } }, { acceptanceCriteria: { contains: value } }] } } },
  ] })) } : {}
}

export async function getQualityInspectionStandardWorkspace(input: { keyword?: string; status?: string; advancedConditions?: readonly ResourceSearchCondition[] }) {
  const keyword = input.keyword?.trim() || ''
  const status = input.status === 'DRAFT' || input.status === 'RELEASED' || input.status === 'OBSOLETE' ? input.status : undefined
  const [standards, materials] = await Promise.all([
    prisma.qualityInspectionStandard.findMany({
      where: {
        ...(status ? { status } : {}),
        AND: [standardKeywordWhere(keyword), ...(input.advancedConditions || []).map(standardAdvancedWhere)],
      },
      include: {
        material: { select: { id: true, code: true, name: true, stockUnit: true, deletedAt: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }, { version: 'desc' }], take: 200,
    }),
    prisma.material.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, stockUnit: true }, orderBy: { code: 'asc' }, take: 500 }),
  ])
  return { standards, materials }
}
