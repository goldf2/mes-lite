import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { EquipmentItem } from '../contracts/equipment'
import type { EquipmentForm } from '../contracts/equipment'

export const equipmentStatusOptions = [
  { value: 'AVAILABLE', label: '可用' },
  { value: 'IN_USE', label: '使用中' },
  { value: 'FAULT', label: '故障' },
  { value: 'MAINTENANCE', label: '维护中' },
  { value: 'STOPPED', label: '停机' },
]

export const equipmentStatusLabels = Object.fromEntries(equipmentStatusOptions.map((item) => [item.value, item.label]))

export function buildEquipmentSearchCatalog(workCenterOptions: readonly { value: string; label: string }[]) {
  return defineResourceSearchCatalog<EquipmentItem>('equipment.actual-fields', [
    { key: 'code', label: '设备编码', type: 'text', read: (item) => item.code },
    { key: 'name', label: '设备名称', type: 'text', read: (item) => item.name },
    { key: 'equipmentType', label: '设备类型', type: 'text', read: (item) => item.equipmentType },
    { key: 'workCenterId', label: '工作中心', type: 'select', read: (item) => [item.workCenterId, item.workCenter.code, item.workCenter.name], options: workCenterOptions },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, equipmentStatusLabels[item.status]], options: equipmentStatusOptions },
    { key: 'manufacturer', label: '制造商', type: 'text', read: (item) => item.manufacturer },
    { key: 'model', label: '型号', type: 'text', read: (item) => item.model },
    { key: 'serialNumber', label: '出厂编号', type: 'text', read: (item) => item.serialNumber },
    { key: 'location', label: '现场位置', type: 'text', read: (item) => item.location },
    { key: 'basicParameters', label: '基础参数', type: 'text', read: (item) => item.basicParameters },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
  ])
}

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
