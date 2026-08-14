import { prisma } from '@/lib/prisma'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { equipmentInspectionScopeWhere } from '../domain/equipment-inspection-rules'

const inspectionPlanInclude = {
  equipment: { select: { id: true, code: true, name: true, status: true, workCenter: { select: { id: true, code: true, name: true } } } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  records: { orderBy: { inspectedAt: 'desc' as const }, take: 10, include: { items: { orderBy: { sortOrder: 'asc' as const } } } },
}

export async function listEquipmentInspectionWorkspace(input: {
  filter?: 'DUE' | 'ALL' | 'ABNORMAL'
  keyword?: string | null
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const now = input.now || new Date()
  const keyword = input.keyword?.trim() || ''
  const plans = await prisma.equipmentInspectionPlan.findMany({
    where: {
      ...equipmentInspectionScopeWhere(scope),
      ...(input.filter === 'DUE' ? { status: 'ACTIVE', nextDueAt: { lte: now } } : {}),
      ...(input.filter === 'ABNORMAL' ? { records: { some: { result: 'ABNORMAL' } } } : {}),
      ...(keyword ? { OR: [
        { code: { contains: keyword } }, { name: { contains: keyword } },
        { equipment: { is: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } } },
      ] } : {}),
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
  now?: Date
}, scope: EffectiveDataScope = unrestrictedDataScope) {
  const [workspace, equipmentOptions] = await Promise.all([
    listEquipmentInspectionWorkspace(input, scope),
    listInspectionEquipmentOptions(scope),
  ])
  return { ...workspace, equipmentOptions }
}
