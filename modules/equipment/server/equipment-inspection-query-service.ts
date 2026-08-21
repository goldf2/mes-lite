import { prisma } from '@/lib/prisma'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { equipmentInspectionScopeWhere } from '../domain/equipment-inspection-rules'
import type { Prisma } from '@prisma/client'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'

const inspectionPlanInclude = {
  equipment: { select: { id: true, code: true, name: true, status: true, workCenter: { select: { id: true, code: true, name: true } } } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  records: { orderBy: { inspectedAt: 'desc' as const }, take: 10, include: { items: { orderBy: { sortOrder: 'asc' as const } } } },
}

function textFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}

function numberFilter(condition: ResourceSearchCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return null
  return condition.operator === 'gt' ? { gt: value } : condition.operator === 'gte' ? { gte: value } : condition.operator === 'lt' ? { lt: value } : condition.operator === 'lte' ? { lte: value } : { equals: value }
}

function dateFilter(condition: ResourceSearchCondition) {
  const start = new Date(`${condition.value}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const next = new Date(start.getTime() + 86_400_000)
  return condition.operator === 'gt' ? { gte: next } : condition.operator === 'gte' ? { gte: start } : condition.operator === 'lt' ? { lt: start } : condition.operator === 'lte' ? { lt: next } : { gte: start, lt: next }
}

function inspectionAdvancedWhere(condition: ResourceSearchCondition): Prisma.EquipmentInspectionPlanWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'code' || condition.field === 'name' || condition.field === 'note') return { [condition.field]: text }
  if (condition.field === 'status') return { status: condition.value }
  if (condition.field === 'equipmentId') return { equipmentId: condition.value }
  if (condition.field === 'workCenter') return { equipment: { is: { workCenter: { is: { OR: [{ code: text }, { name: text }] } } } } }
  if (condition.field === 'intervalDays') return { intervalDays: numberFilter(condition) || { equals: Number.NaN } }
  if (condition.field === 'nextDueAt') return { nextDueAt: dateFilter(condition) || { equals: new Date(0) } }
  if (condition.field === 'checkItem') return { items: { some: { OR: [{ name: text }, { standard: text }, { unit: text }] } } }
  if (condition.field === 'recordNo') return { records: { some: { recordNo: text } } }
  if (condition.field === 'recordResult') return { records: { some: { result: condition.value } } }
  if (condition.field === 'inspector') return { records: { some: { inspectorName: text } } }
  if (condition.field === 'recordNote') return { records: { some: { note: text } } }
  if (condition.field === 'inspectedAt') return { records: { some: { inspectedAt: dateFilter(condition) || { equals: new Date(0) } } } }
  return { id: '__INVALID_SEARCH_FIELD__' }
}

function inspectionKeywordWhere(keyword: string): Prisma.EquipmentInspectionPlanWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [
    { code: { contains: value } }, { name: { contains: value } }, { note: { contains: value } },
    { equipment: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { workCenter: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } }] } } },
    { items: { some: { OR: [{ name: { contains: value } }, { standard: { contains: value } }, { unit: { contains: value } }] } } },
    { records: { some: { OR: [{ recordNo: { contains: value } }, { inspectorName: { contains: value } }, { note: { contains: value } }, { items: { some: { OR: [{ itemName: { contains: value } }, { standard: { contains: value } }, { actualValue: { contains: value } }, { note: { contains: value } }] } } }] } } },
  ] })) } : {}
}

export async function listEquipmentInspectionWorkspace(input: {
  filter?: 'DUE' | 'ALL' | 'ABNORMAL'
  keyword?: string | null
  advancedConditions?: readonly ResourceSearchCondition[]
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const now = input.now || new Date()
  const keyword = input.keyword?.trim() || ''
  const plans = await prisma.equipmentInspectionPlan.findMany({
    where: {
      ...equipmentInspectionScopeWhere(scope),
      ...(input.filter === 'DUE' ? { status: 'ACTIVE', nextDueAt: { lte: now } } : {}),
      ...(input.filter === 'ABNORMAL' ? { records: { some: { result: 'ABNORMAL' } } } : {}),
      AND: [inspectionKeywordWhere(keyword), ...(input.advancedConditions || []).map(inspectionAdvancedWhere)],
    },
    include: inspectionPlanInclude,
    orderBy: [{ nextDueAt: 'asc' }, { code: 'asc' }],
  })
  const [due, overdue, abnormal] = await Promise.all([
    prisma.equipmentInspectionPlan.count({ where: { ...equipmentInspectionScopeWhere(scope), status: 'ACTIVE', nextDueAt: { lte: now } } }),
    prisma.equipmentInspectionPlan.count({ where: { ...equipmentInspectionScopeWhere(scope), status: 'ACTIVE', nextDueAt: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    prisma.equipmentInspectionRecord.count({ where: { result: 'ABNORMAL', plan: { is: equipmentInspectionScopeWhere(scope) } } }),
  ])
  return { plans, counts: { due, overdue, abnormal } }
}

export async function listInspectionEquipmentOptions(scope: EffectiveDataScope = unrestrictedDataScope) {
  const workCenterWhere = scope.productionMode === 'ALL'
    ? {}
    : { workCenterId: { in: scope.productionMode === 'WORK_CENTERS' ? scope.workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } }
  return prisma.equipment.findMany({
    where: { deletedAt: null, ...workCenterWhere },
    select: { id: true, code: true, name: true, status: true, workCenter: { select: { id: true, code: true, name: true } } },
    orderBy: { code: 'asc' },
  })
}

export async function getEquipmentInspectionWorkspace(input: {
  filter?: 'DUE' | 'ALL' | 'ABNORMAL'
  keyword?: string | null
  advancedConditions?: readonly ResourceSearchCondition[]
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const [workspace, equipmentOptions] = await Promise.all([
    listEquipmentInspectionWorkspace(input, scope),
    listInspectionEquipmentOptions(scope),
  ])
  return { ...workspace, equipmentOptions }
}
