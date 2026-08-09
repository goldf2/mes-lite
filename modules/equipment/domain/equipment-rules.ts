import type { EquipmentInput } from '../contracts/equipment-schema'
import type { WorkCenterUpdateInput } from '../contracts/work-center-schema'
import { EquipmentDomainError } from './equipment-errors'

export function normalizeEquipmentCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

export function equipmentWriteData(input: EquipmentInput) {
  return {
    code: normalizeEquipmentCode(input.code),
    name: input.name.trim(),
    equipmentType: input.equipmentType.trim(),
    workCenterId: input.workCenterId,
    model: input.model?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    serialNumber: input.serialNumber?.trim() || null,
    status: input.status || 'AVAILABLE',
    location: input.location?.trim() || null,
    basicParameters: input.basicParameters?.trim() || null,
    note: input.note?.trim() || null,
  }
}

export function assertWorkCenterUpdateAllowed(
  existing: { isActive: boolean },
  input: WorkCenterUpdateInput,
) {
  if (existing.isActive && input.isActive === false) {
    throw new EquipmentDomainError('请使用归档操作停用工作中心，以完成设备引用校验')
  }
}
