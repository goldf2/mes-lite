import { prisma } from '@/lib/prisma'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { equipmentMaintenanceScopeWhere } from '../domain/equipment-maintenance-rules'
import { equipmentMaintenanceWorkOrderInclude } from './equipment-maintenance-command-service'

export async function listEquipmentMaintenanceWorkspace(input: {
  filter?: 'DUE' | 'OPEN' | 'HISTORY' | 'ALL'
  keyword?: string | null
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const now = input.now || new Date()
  const filter = input.filter || 'DUE'
  const keyword = input.keyword?.trim()
  const scoped = equipmentMaintenanceScopeWhere(scope)
  const keywordWhere = keyword ? {
    OR: [
      { code: { contains: keyword } }, { name: { contains: keyword } },
      { equipment: { is: { code: { contains: keyword } } } },
      { equipment: { is: { name: { contains: keyword } } } },
      { equipment: { is: { workCenter: { is: { name: { contains: keyword } } } } } },
    ],
  } : {}
  const orderKeywordWhere = keyword ? {
    OR: [
      { workOrderNo: { contains: keyword } }, { title: { contains: keyword } },
      { faultDescription: { contains: keyword } }, { assignedTo: { contains: keyword } },
      { equipment: { is: { code: { contains: keyword } } } }, { equipment: { is: { name: { contains: keyword } } } },
    ],
  } : {}
  const planFilter = filter === 'DUE' ? { status: 'ACTIVE', nextDueAt: { lte: now } } : {}
  const orderFilter = filter === 'OPEN' || filter === 'DUE'
    ? { status: { in: ['OPEN', 'IN_PROGRESS'] } }
    : filter === 'HISTORY' ? { status: { in: ['COMPLETED', 'CANCELLED'] } } : {}

  const [plans, workOrders, duePlans, overduePlans, openOrders, activeOrders, completedOrders] = await Promise.all([
    prisma.equipmentMaintenancePlan.findMany({
      where: { ...scoped, ...planFilter, ...keywordWhere },
      include: {
        equipment: { include: { workCenter: true } }, items: { orderBy: { sortOrder: 'asc' } },
        workOrders: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, workOrderNo: true, status: true, planDueAt: true } },
      },
      orderBy: [{ nextDueAt: 'asc' }, { code: 'asc' }],
    }),
    prisma.equipmentMaintenanceWorkOrder.findMany({
      where: { ...scoped, ...orderFilter, ...orderKeywordWhere }, include: equipmentMaintenanceWorkOrderInclude,
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
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const [workspace, equipmentOptions, materialOptions] = await Promise.all([
    listEquipmentMaintenanceWorkspace(input, scope),
    listMaintenanceEquipmentOptions(scope),
    listMaintenanceMaterialOptions(scope),
  ])
  return { ...workspace, equipmentOptions, materialOptions }
}
