import type { EquipmentEventAction } from '../contracts/equipment-event-schema'
import { EquipmentDomainError } from './equipment-errors'

const transitions: Record<EquipmentEventAction, Partial<Record<string, string>>> = {
  START: { AVAILABLE: 'IN_USE' },
  STOP: { AVAILABLE: 'STOPPED', IN_USE: 'STOPPED' },
  FAULT: { AVAILABLE: 'FAULT', IN_USE: 'FAULT' },
  MAINTAIN: { AVAILABLE: 'MAINTENANCE', IN_USE: 'MAINTENANCE', STOPPED: 'MAINTENANCE', FAULT: 'MAINTENANCE' },
  RECOVER: { STOPPED: 'AVAILABLE', FAULT: 'AVAILABLE', MAINTENANCE: 'AVAILABLE' },
}

export const equipmentEventActionLabels: Record<EquipmentEventAction, string> = {
  START: '开始运行',
  STOP: '停机',
  FAULT: '报告故障',
  MAINTAIN: '进入维修',
  RECOVER: '恢复可用',
}

export function resolveEquipmentTransition(status: string, action: EquipmentEventAction) {
  const targetStatus = transitions[action][status]
  if (!targetStatus) {
    throw new EquipmentDomainError(`设备当前状态 ${status} 不允许执行“${equipmentEventActionLabels[action]}”`, 409)
  }
  return { sourceStatus: status, targetStatus }
}

export function availableEquipmentEventActions(status: string) {
  return (Object.keys(transitions) as EquipmentEventAction[]).filter((action) => Boolean(transitions[action][status]))
}
