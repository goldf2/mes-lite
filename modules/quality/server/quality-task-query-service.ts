import { prisma } from '@/lib/prisma'
import type { QualityTaskFilter } from '../contracts/quality-task'
import { qualityInspectionDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { Prisma } from '@prisma/client'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'

const tolerance = 0.000001

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

function qualityTaskAdvancedWhere(condition: ResourceSearchCondition): Prisma.QualityInspectionWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'inspectionNo' || condition.field === 'sourceId' || condition.field === 'inspector' || condition.field === 'note') return { [condition.field]: text }
  if (condition.field === 'lotNo') return { lot: { is: { lotNo: text } } }
  if (condition.field === 'material') return { lot: { is: { material: { is: { OR: [{ code: text }, { name: text }, { stockUnit: text }] } } } } }
  if (condition.field === 'sourceType' || condition.field === 'status' || condition.field === 'result') return { [condition.field]: condition.value }
  if (['round', 'inspectedQty', 'sampleQty', 'goodQty', 'badQty'].includes(condition.field)) return { [condition.field]: numberFilter(condition) }
  if (condition.field === 'standard') return { OR: [{ standardCodeSnapshot: text }, { standardNameSnapshot: text }] }
  if (condition.field === 'checkItem') return { checkItems: { some: { OR: [{ name: text }, { method: text }, { acceptanceCriteria: text }, { measuredValue: text }, { result: text }, { note: text }] } } }
  if (condition.field === 'disposition') return { dispositions: { some: { OR: [{ dispositionNo: text }, { action: text }, { reason: text }, { performedBy: text }] } } }
  if (condition.field === 'checkedAt' || condition.field === 'createdAt') return { [condition.field]: dateFilter(condition) }
  return { id: '__INVALID_SEARCH_FIELD__' }
}

function qualityTaskKeywordWhere(keyword: string): Prisma.QualityInspectionWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [
    { inspectionNo: { contains: value } }, { sourceId: { contains: value } }, { sourceType: { contains: value } }, { inspector: { contains: value } }, { note: { contains: value } },
    { standardCodeSnapshot: { contains: value } }, { standardNameSnapshot: { contains: value } },
    { lot: { is: { OR: [{ lotNo: { contains: value } }, { material: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { stockUnit: { contains: value } }] } } }] } } },
    { checkItems: { some: { OR: [{ name: { contains: value } }, { method: { contains: value } }, { acceptanceCriteria: { contains: value } }, { measuredValue: { contains: value } }, { note: { contains: value } }] } } },
    { dispositions: { some: { OR: [{ dispositionNo: { contains: value } }, { action: { contains: value } }, { reason: { contains: value } }, { performedBy: { contains: value } }] } } },
  ] })) } : {}
}

export async function listQualityTaskWorkspace(input: { keyword?: string; filter: QualityTaskFilter; advancedConditions?: readonly ResourceSearchCondition[] }, scope: EffectiveDataScope = unrestrictedDataScope) {
  const keyword = input.keyword?.trim() || ''
  const searchWhere = { AND: [qualityTaskKeywordWhere(keyword), ...(input.advancedConditions || []).map(qualityTaskAdvancedWhere)] }
  const dispositionBalance = {
    some: { inventoryStatus: { in: ['HOLD', 'REWORK'] }, stockQty: { gt: tolerance } },
  }
  const where = input.filter === 'PENDING'
    ? { ...searchWhere, status: 'PENDING', ...qualityInspectionDataScopeWhere(scope) }
    : input.filter === 'DISPOSITION'
      ? { AND: [{ ...searchWhere, status: 'COMPLETED', lot: { balances: dispositionBalance } }, qualityInspectionDataScopeWhere(scope)] }
      : { AND: [searchWhere, qualityInspectionDataScopeWhere(scope)] }
  const [rows, pending, dispositionLots] = await Promise.all([
    prisma.qualityInspection.findMany({
      where,
      include: {
        checkItems: { orderBy: { sortOrder: 'asc' } },
        dispositions: { orderBy: { performedAt: 'desc' } },
        lot: { include: {
          material: { select: { id: true, code: true, name: true, stockUnit: true } },
          balances: true,
          qualityDispositions: { orderBy: { performedAt: 'desc' } },
        } },
      },
      orderBy: [{ createdAt: 'desc' }, { round: 'desc' }],
      take: 200,
    }),
    prisma.qualityInspection.count({ where: { status: 'PENDING', ...qualityInspectionDataScopeWhere(scope) } }),
    prisma.inventoryLot.count({ where: { status: 'OPEN', balances: { some: {
      inventoryStatus: { in: ['HOLD', 'REWORK'] }, stockQty: { gt: tolerance },
      ...(scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}),
    } } } }),
  ])
  const seenLots = new Set<string>()
  const items = rows.filter((row) => {
    if (seenLots.has(row.lotId)) return false
    seenLots.add(row.lotId)
    return true
  }).slice(0, 100).map((row) => ({ ...row, dispositions: row.lot.qualityDispositions }))
  return { items, counts: { pending, disposition: dispositionLots } }
}
