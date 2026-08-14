import type { EffectiveDataScope } from '@/modules/identity-access'
import { DataScopeError } from '@/modules/identity-access'
import { EquipmentDomainError } from './equipment-errors'

export function addInspectionInterval(date: Date, intervalDays: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + intervalDays)
  return next
}

export function nextInspectionDue(dueAt: Date, intervalDays: number, inspectedAt: Date) {
  let next = addInspectionInterval(dueAt, intervalDays)
  while (next.getTime() <= inspectedAt.getTime()) next = addInspectionInterval(next, intervalDays)
  return next
}

export function equipmentInspectionScopeWhere(scope: EffectiveDataScope) {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'WORK_CENTERS') {
    return { equipment: { is: { workCenterId: { in: scope.workCenterIds.length > 0 ? scope.workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } } } }
  }
  return { id: '__SELF_SCOPE_HAS_NO_EQUIPMENT_ASSIGNMENT__' }
}

export function assertEquipmentInspectionScope(scope: EffectiveDataScope, workCenterId: string) {
  if (scope.productionMode === 'ALL') return
  if (scope.productionMode === 'WORK_CENTERS' && scope.workCenterIds.includes(workCenterId)) return
  throw new DataScopeError('设备点检计划不在当前账号的工作中心范围内')
}

export function assertInspectionResults(
  planItems: Array<{ id: string }>,
  submitted: Array<{ planItemId: string; result: 'PASS' | 'FAIL'; note?: string | null }>,
) {
  const expected = new Set(planItems.map((item) => item.id))
  const actual = new Set(submitted.map((item) => item.planItemId))
  if (actual.size !== submitted.length || expected.size !== actual.size || Array.from(expected).some((id) => !actual.has(id))) {
    throw new EquipmentDomainError('必须逐项提交当前点检计划的全部项目，不能缺项或重复')
  }
  if (submitted.some((item) => item.result === 'FAIL' && !item.note?.trim())) {
    throw new EquipmentDomainError('异常点检项目必须填写异常说明')
  }
}

export function inspectionResultOf(items: Array<{ result: 'PASS' | 'FAIL' }>) {
  return items.some((item) => item.result === 'FAIL') ? 'ABNORMAL' : 'PASS'
}
