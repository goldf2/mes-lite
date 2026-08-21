import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { EquipmentInspectionEquipmentOption, EquipmentInspectionPlan } from '../contracts/equipment-inspection'
import type {
  EquipmentMaintenanceEquipmentOption,
  EquipmentMaintenancePlan,
  EquipmentMaintenanceWorkOrder,
} from '../contracts/equipment-maintenance'

export const equipmentInspectionSearchFieldKeys = [
  'code', 'name', 'status', 'equipmentId', 'workCenter', 'intervalDays', 'nextDueAt', 'note',
  'checkItem', 'recordNo', 'recordResult', 'inspector', 'recordNote', 'inspectedAt',
] as const

export function buildEquipmentInspectionSearchCatalog(equipment: readonly EquipmentInspectionEquipmentOption[] = []) {
  return defineResourceSearchCatalog<EquipmentInspectionPlan>('equipment-inspection.actual-fields', [
    { key: 'code', label: '计划编号', type: 'text', read: (item) => item.code },
    { key: 'name', label: '计划名称', type: 'text', read: (item) => item.name },
    { key: 'status', label: '计划状态', type: 'select', read: (item) => [item.status, item.status === 'ACTIVE' ? '启用' : '暂停'], options: [{ value: 'ACTIVE', label: '启用' }, { value: 'PAUSED', label: '暂停' }] },
    { key: 'equipmentId', label: '设备', type: equipment.length ? 'select' : 'text', read: (item) => [item.equipment.id, item.equipment.code, item.equipment.name], options: equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'workCenter', label: '工作中心', type: 'text', read: (item) => [item.equipment.workCenter.code, item.equipment.workCenter.name] },
    { key: 'intervalDays', label: '点检周期（天）', type: 'number', read: (item) => item.intervalDays },
    { key: 'nextDueAt', label: '下次到期日期', type: 'date', read: (item) => item.nextDueAt },
    { key: 'note', label: '计划备注', type: 'text', read: (item) => item.note },
    { key: 'checkItem', label: '检查项目／标准', type: 'text', read: (item) => item.items.flatMap((entry) => [entry.name, entry.standard, entry.unit]) },
    { key: 'recordNo', label: '点检记录号', type: 'text', read: (item) => item.records.map((entry) => entry.recordNo) },
    { key: 'recordResult', label: '点检结果', type: 'select', read: (item) => item.records.flatMap((entry) => [entry.result, entry.result === 'ABNORMAL' ? '异常' : '正常']), options: [{ value: 'NORMAL', label: '正常' }, { value: 'ABNORMAL', label: '异常' }] },
    { key: 'inspector', label: '点检人', type: 'text', read: (item) => item.records.map((entry) => entry.inspectorName) },
    { key: 'recordNote', label: '点检记录备注', type: 'text', read: (item) => item.records.map((entry) => entry.note) },
    { key: 'inspectedAt', label: '点检日期', type: 'date', read: (item) => item.records.map((entry) => entry.inspectedAt) },
  ])
}

export type EquipmentMaintenanceSearchRow =
  | { kind: 'PLAN'; value: EquipmentMaintenancePlan }
  | { kind: 'WORK_ORDER'; value: EquipmentMaintenanceWorkOrder }

export const equipmentMaintenanceSearchFieldKeys = [
  'recordType', 'number', 'name', 'equipmentId', 'workCenter', 'status', 'kind', 'priority',
  'intervalDays', 'dueAt', 'assignedTo', 'description', 'checkItem', 'spareMaterial', 'location',
  'startedAt', 'completedAt',
] as const

export function buildEquipmentMaintenanceSearchCatalog(equipment: readonly EquipmentMaintenanceEquipmentOption[] = []) {
  return defineResourceSearchCatalog<EquipmentMaintenanceSearchRow>('equipment-maintenance.actual-fields', [
    { key: 'recordType', label: '记录类型', type: 'select', read: (row) => [row.kind, row.kind === 'PLAN' ? '保养计划' : '维保工单'], options: [{ value: 'PLAN', label: '保养计划' }, { value: 'WORK_ORDER', label: '维保工单' }] },
    { key: 'number', label: '计划／工单编号', type: 'text', read: (row) => row.kind === 'PLAN' ? row.value.code : row.value.workOrderNo },
    { key: 'name', label: '计划名称／工单标题', type: 'text', read: (row) => row.kind === 'PLAN' ? row.value.name : row.value.title },
    { key: 'equipmentId', label: '设备', type: equipment.length ? 'select' : 'text', read: (row) => [row.value.equipment.id, row.value.equipment.code, row.value.equipment.name], options: equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'workCenter', label: '工作中心', type: 'text', read: (row) => [row.value.equipment.workCenter.code, row.value.equipment.workCenter.name] },
    { key: 'status', label: '状态', type: 'select', read: (row) => [row.value.status, row.kind === 'PLAN' ? row.value.status === 'ACTIVE' ? '启用' : '暂停' : ({ OPEN: '待处理', IN_PROGRESS: '维修中', COMPLETED: '已完成', CANCELLED: '已取消' } as Record<string, string>)[row.value.status]], options: [{ value: 'ACTIVE', label: '启用' }, { value: 'PAUSED', label: '暂停' }, { value: 'OPEN', label: '待处理' }, { value: 'IN_PROGRESS', label: '维修中' }, { value: 'COMPLETED', label: '已完成' }, { value: 'CANCELLED', label: '已取消' }] },
    { key: 'kind', label: '工单类型', type: 'select', read: (row) => row.kind === 'WORK_ORDER' ? row.value.kind : null, options: [{ value: 'PREVENTIVE', label: '预防保养' }, { value: 'CORRECTIVE', label: '故障维修' }] },
    { key: 'priority', label: '优先级', type: 'select', read: (row) => row.kind === 'WORK_ORDER' ? [row.value.priority, ({ LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急' } as Record<string, string>)[row.value.priority]] : null, options: [{ value: 'LOW', label: '低' }, { value: 'NORMAL', label: '普通' }, { value: 'HIGH', label: '高' }, { value: 'URGENT', label: '紧急' }] },
    { key: 'intervalDays', label: '保养周期（天）', type: 'number', read: (row) => row.kind === 'PLAN' ? row.value.intervalDays : null },
    { key: 'dueAt', label: '到期日期', type: 'date', read: (row) => row.kind === 'PLAN' ? row.value.nextDueAt : row.value.dueAt },
    { key: 'assignedTo', label: '负责人', type: 'text', read: (row) => row.kind === 'WORK_ORDER' ? row.value.assignedTo : null },
    { key: 'description', label: '故障／工作／原因说明', type: 'text', read: (row) => row.kind === 'PLAN' ? row.value.note : [row.value.faultDescription, row.value.workDescription, row.value.failureCause] },
    { key: 'checkItem', label: '保养项目／标准／结果', type: 'text', read: (row) => row.kind === 'PLAN' ? row.value.items.flatMap((entry) => [entry.name, entry.standard]) : row.value.results.flatMap((entry) => [entry.itemName, entry.standard, entry.result, entry.note]) },
    { key: 'spareMaterial', label: '备件物料／批次', type: 'text', read: (row) => row.kind === 'WORK_ORDER' ? row.value.spares.flatMap((entry) => [entry.material.code, entry.material.name, ...entry.lotAllocations.map((allocation) => allocation.lot.lotNo)]) : null },
    { key: 'location', label: '备件库位', type: 'text', read: (row) => row.kind === 'WORK_ORDER' ? row.value.spares.flatMap((entry) => [entry.location.code, entry.location.name]) : null },
    { key: 'startedAt', label: '开始日期', type: 'date', read: (row) => row.kind === 'WORK_ORDER' ? row.value.startedAt : null },
    { key: 'completedAt', label: '完成日期', type: 'date', read: (row) => row.kind === 'WORK_ORDER' ? row.value.completedAt : null },
  ])
}
