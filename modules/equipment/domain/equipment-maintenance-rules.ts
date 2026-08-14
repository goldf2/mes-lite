import type { EffectiveDataScope } from '@/modules/identity-access'
import { DataScopeError } from '@/modules/identity-access'
import type { CompleteEquipmentMaintenanceWorkOrderInput } from '../contracts/equipment-maintenance-schema'
import { EquipmentDomainError } from './equipment-errors'

export function equipmentMaintenanceScopeWhere(scope: EffectiveDataScope) {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'WORK_CENTERS') {
    return { equipment: { is: { workCenterId: { in: scope.workCenterIds.length > 0 ? scope.workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } } } }
  }
  return { id: '__SELF_SCOPE_HAS_NO_EQUIPMENT_ASSIGNMENT__' }
}
export function assertEquipmentMaintenanceScope(scope: EffectiveDataScope, workCenterId: string) {
  if (scope.productionMode === 'ALL') return
  if (scope.productionMode === 'WORK_CENTERS' && scope.workCenterIds.includes(workCenterId)) return
  throw new DataScopeError('设备不在当前账号的工作中心数据范围内', 403)
}

export function assertMaintenanceCompletionItems(
  workOrder: { kind: string; plan?: { items: Array<{ id: string }> } | null },
  submitted: CompleteEquipmentMaintenanceWorkOrderInput['items'],
) {
  if (workOrder.kind === 'CORRECTIVE') {
    if (submitted.length > 0) throw new EquipmentDomainError('维修工单不接受保养计划项目', 400)
    return
  }
  const expected = workOrder.plan?.items || []
  const submittedIds = new Set(submitted.map((item) => item.planItemId))
  if (submittedIds.size !== submitted.length || submitted.length !== expected.length || expected.some((item) => !submittedIds.has(item.id))) {
    throw new EquipmentDomainError('必须逐项确认完整的保养清单', 400)
  }
}

export function nextMaintenanceDue(dueAt: Date, intervalDays: number, completedAt: Date) {
  const step = intervalDays * 24 * 60 * 60 * 1000
  let next = new Date(dueAt.getTime() + step)
  while (next <= completedAt) next = new Date(next.getTime() + step)
  return next
}
