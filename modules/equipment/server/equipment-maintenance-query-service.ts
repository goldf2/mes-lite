import { prisma } from '@/lib/prisma'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { equipmentMaintenanceScopeWhere } from '../domain/equipment-maintenance-rules'
import { equipmentMaintenanceWorkOrderInclude } from './equipment-maintenance-command-service'
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

function planAdvancedWhere(condition: ResourceSearchCondition): Prisma.EquipmentMaintenancePlanWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'recordType') return condition.value === 'PLAN' ? {} : { id: '__WORK_ORDER_ONLY__' }
  if (condition.field === 'number') return { code: text }
  if (condition.field === 'name') return { name: text }
  if (condition.field === 'equipmentId') return { equipmentId: condition.value }
  if (condition.field === 'workCenter') return { equipment: { is: { workCenter: { is: { OR: [{ code: text }, { name: text }] } } } } }
  if (condition.field === 'status') return ['ACTIVE', 'PAUSED'].includes(condition.value) ? { status: condition.value } : { id: '__WORK_ORDER_STATUS__' }
  if (condition.field === 'intervalDays') return { intervalDays: numberFilter(condition) }
  if (condition.field === 'dueAt') return { nextDueAt: dateFilter(condition) }
  if (condition.field === 'description') return { note: text }
  if (condition.field === 'checkItem') return { items: { some: { OR: [{ name: text }, { standard: text }] } } }
  return { id: '__WORK_ORDER_FIELD__' }
}

function orderAdvancedWhere(condition: ResourceSearchCondition): Prisma.EquipmentMaintenanceWorkOrderWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'recordType') return condition.value === 'WORK_ORDER' ? {} : { id: '__PLAN_ONLY__' }
  if (condition.field === 'number') return { workOrderNo: text }
  if (condition.field === 'name') return { title: text }
  if (condition.field === 'equipmentId') return { equipmentId: condition.value }
  if (condition.field === 'workCenter') return { equipment: { is: { workCenter: { is: { OR: [{ code: text }, { name: text }] } } } } }
  if (condition.field === 'status') return ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(condition.value) ? { status: condition.value } : { id: '__PLAN_STATUS__' }
  if (condition.field === 'kind' || condition.field === 'priority') return { [condition.field]: condition.value }
  if (condition.field === 'dueAt' || condition.field === 'startedAt' || condition.field === 'completedAt') return { [condition.field]: dateFilter(condition) }
  if (condition.field === 'assignedTo') return { assignedTo: text }
  if (condition.field === 'description') return { OR: [{ faultDescription: text }, { workDescription: text }, { failureCause: text }] }
  if (condition.field === 'checkItem') return { OR: [{ plan: { is: { items: { some: { OR: [{ name: text }, { standard: text }] } } } } }, { results: { some: { OR: [{ itemName: text }, { standard: text }, { result: text }, { note: text }] } } }] }
  if (condition.field === 'spareMaterial') return { spares: { some: { OR: [{ material: { is: { code: text } } }, { material: { is: { name: text } } }, { lotAllocations: { some: { lot: { is: { lotNo: text } } } } }] } } }
  if (condition.field === 'location') return { spares: { some: { location: { is: { OR: [{ code: text }, { name: text }] } } } } }
  return { id: '__PLAN_FIELD__' }
}

function planKeywordWhere(keyword: string): Prisma.EquipmentMaintenancePlanWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [{ code: { contains: value } }, { name: { contains: value } }, { note: { contains: value } }, { equipment: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { workCenter: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } }] } } }, { items: { some: { OR: [{ name: { contains: value } }, { standard: { contains: value } }] } } }] })) } : {}
}

function orderKeywordWhere(keyword: string): Prisma.EquipmentMaintenanceWorkOrderWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [
    { workOrderNo: { contains: value } }, { title: { contains: value } }, { faultDescription: { contains: value } }, { assignedTo: { contains: value } }, { workDescription: { contains: value } }, { failureCause: { contains: value } },
    { equipment: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { workCenter: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } }] } } },
    { plan: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { items: { some: { OR: [{ name: { contains: value } }, { standard: { contains: value } }] } } }] } } },
    { results: { some: { OR: [{ itemName: { contains: value } }, { standard: { contains: value } }, { result: { contains: value } }, { note: { contains: value } }] } } },
    { spares: { some: { OR: [{ material: { is: { code: { contains: value } } } }, { material: { is: { name: { contains: value } } } }, { location: { is: { code: { contains: value } } } }, { location: { is: { name: { contains: value } } } }, { lotAllocations: { some: { lot: { is: { lotNo: { contains: value } } } } } }] } } },
  ] })) } : {}
}

export async function listEquipmentMaintenanceWorkspace(input: {
  filter?: 'DUE' | 'OPEN' | 'HISTORY' | 'ALL'
  keyword?: string | null
  advancedConditions?: readonly ResourceSearchCondition[]
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const now = input.now || new Date()
  const filter = input.filter || 'DUE'
  const keyword = input.keyword?.trim()
  const scoped = equipmentMaintenanceScopeWhere(scope)
  const planKeywordFilter = planKeywordWhere(keyword || '')
  const orderKeywordFilter = orderKeywordWhere(keyword || '')
  const planFilter = filter === 'DUE' ? { status: 'ACTIVE', nextDueAt: { lte: now } } : {}
  const orderFilter = filter === 'OPEN' || filter === 'DUE'
    ? { status: { in: ['OPEN', 'IN_PROGRESS'] } }
    : filter === 'HISTORY' ? { status: { in: ['COMPLETED', 'CANCELLED'] } } : {}

  const [plans, workOrders, duePlans, overduePlans, openOrders, activeOrders, completedOrders] = await Promise.all([
    prisma.equipmentMaintenancePlan.findMany({
      where: { ...scoped, ...planFilter, AND: [planKeywordFilter, ...(input.advancedConditions || []).map(planAdvancedWhere)] },
      include: {
        equipment: { include: { workCenter: true } }, items: { orderBy: { sortOrder: 'asc' } },
        workOrders: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, workOrderNo: true, status: true, planDueAt: true } },
      },
      orderBy: [{ nextDueAt: 'asc' }, { code: 'asc' }],
    }),
    prisma.equipmentMaintenanceWorkOrder.findMany({
      where: { ...scoped, ...orderFilter, AND: [orderKeywordFilter, ...(input.advancedConditions || []).map(orderAdvancedWhere)] }, include: equipmentMaintenanceWorkOrderInclude,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }], take: filter === 'HISTORY' ? 100 : 200,
    }),
    prisma.equipmentMaintenancePlan.count({ where: { ...scoped, status: 'ACTIVE', nextDueAt: { lte: now } } }),
    prisma.equipmentMaintenancePlan.count({ where: { ...scoped, status: 'ACTIVE', nextDueAt: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    prisma.equipmentMaintenanceWorkOrder.count({ where: { ...scoped, status: 'OPEN' } }),
    prisma.equipmentMaintenanceWorkOrder.count({ where: { ...scoped, status: 'IN_PROGRESS' } }),
    prisma.equipmentMaintenanceWorkOrder.count({ where: { ...scoped, status: 'COMPLETED' } }),
  ])
  return { plans, workOrders, counts: { duePlans, overduePlans, openOrders, activeOrders, completedOrders } }
}

export async function listMaintenanceEquipmentOptions(scope: EffectiveDataScope = unrestrictedDataScope) {
  const workCenterWhere = scope.productionMode === 'ALL'
    ? {}
    : { workCenterId: { in: scope.productionMode === 'WORK_CENTERS' ? scope.workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } }
  return prisma.equipment.findMany({
    where: { deletedAt: null, ...workCenterWhere },
    select: { id: true, code: true, name: true, status: true, workCenter: { select: { id: true, code: true, name: true } } },
    orderBy: { code: 'asc' },
  })
}

export async function listMaintenanceMaterialOptions(scope: EffectiveDataScope = unrestrictedDataScope) {
  const locationWhere = scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}
  const materials = await prisma.material.findMany({
    where: {
      deletedAt: null,
      stock: { is: { locationBalances: { some: { ...locationWhere, availableQty: { gt: 0.000001 }, location: { is: { isActive: true, deletedAt: null } } } } } },
    },
    select: {
      id: true, code: true, name: true, spec: true, stockUnit: true,
      stock: { select: { availableQty: true, locationBalances: {
        where: { ...locationWhere, availableQty: { gt: 0.000001 }, location: { is: { isActive: true, deletedAt: null } } },
        select: { locationId: true, availableQty: true, location: { select: { id: true, code: true, name: true } } },
        orderBy: { location: { code: 'asc' } },
      } } },
    },
    orderBy: { code: 'asc' },
  })
  return materials.map((material) => ({
    id: material.id, code: material.code, name: material.name, spec: material.spec, stockUnit: material.stockUnit,
    availableQty: scope.inventoryMode === 'ALL'
      ? Number(material.stock?.availableQty || 0)
      : (material.stock?.locationBalances || []).reduce((sum, balance) => sum + Number(balance.availableQty), 0),
    locationBalances: material.stock?.locationBalances || [],
  }))
}

export async function getEquipmentMaintenanceWorkspace(input: {
  filter?: 'DUE' | 'OPEN' | 'HISTORY' | 'ALL'
  keyword?: string | null
  advancedConditions?: readonly ResourceSearchCondition[]
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const [workspace, equipmentOptions, materialOptions] = await Promise.all([
    listEquipmentMaintenanceWorkspace(input, scope),
    listMaintenanceEquipmentOptions(scope),
    listMaintenanceMaterialOptions(scope),
  ])
  return { ...workspace, equipmentOptions, materialOptions }
}
