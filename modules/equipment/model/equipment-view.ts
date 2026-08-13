import type { EquipmentForm } from '../contracts/equipment'

export const equipmentStatusOptions = [
  { value: 'AVAILABLE', label: '可用' },
  { value: 'IN_USE', label: '使用中' },
  { value: 'FAULT', label: '故障' },
  { value: 'MAINTENANCE', label: '维护中' },
  { value: 'STOPPED', label: '停机' },
]

export const equipmentStatusLabels = Object.fromEntries(equipmentStatusOptions.map((item) => [item.value, item.label]))

export const createEmptyEquipmentForm = (): EquipmentForm => ({
  code: '',
  name: '',
  equipmentType: '',
  workCenterId: '',
  model: '',
  manufacturer: '',
  serialNumber: '',
  location: '',
  basicParameters: '',
  note: '',
})
