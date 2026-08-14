import type { PermissionMap } from '@/lib/permissions'
import type { WorkspaceFunctionKey } from '@/lib/workspace'

export interface RoleTaskSummary {
  draftOrderCount: number
  executableOrderCount: number
  pendingProductionActualCount: number
  pendingQualityInspectionCount: number
  qualityDispositionCount: number
  dueEquipmentInspectionCount: number
  pendingMaterialInCount: number
  pendingShipmentCount: number
  pendingReturnCount: number
  pendingOperatorCount: number
}

export interface RoleTaskItem {
  key: string
  label: string
  description: string
  value: number
  tone: 'blue' | 'indigo' | 'yellow' | 'orange' | 'red' | 'emerald'
  functionKey: WorkspaceFunctionKey
  task: string
}

export interface RoleTaskSection {
  key: 'production' | 'quality' | 'equipment' | 'warehouse' | 'system'
  label: string
  description: string
  items: RoleTaskItem[]
}

function canUpdate(permissions: PermissionMap, resource: string) {
  return Boolean(permissions[resource]?.canUpdate)
}

function canRead(permissions: PermissionMap, resource: string) {
  return Boolean(permissions[resource]?.canRead)
}

export function buildRoleTaskSections(summary: RoleTaskSummary, permissions: PermissionMap): RoleTaskSection[] {
  const sections: RoleTaskSection[] = []
  const production: RoleTaskItem[] = []
  if (canUpdate(permissions, 'productionOrderRelease')) production.push({
    key: 'order-release', label: '待发布订单', description: '核对计划与 BOM 后发布', value: summary.draftOrderCount,
    tone: 'blue', functionKey: 'orders', task: 'order-release',
  })
  if (canUpdate(permissions, 'productionActualEntry')) production.push({
    key: 'production-entry', label: '可登记实绩订单', description: '班后登记真实投入与产出', value: summary.executableOrderCount,
    tone: 'indigo', functionKey: 'orders', task: 'production-entry',
  })
  if (canUpdate(permissions, 'productionActualConfirm')) production.push({
    key: 'actual-confirm', label: '待确认生产实绩', description: '复核后过账批次、库存与成本', value: summary.pendingProductionActualCount,
    tone: 'orange', functionKey: 'orders', task: 'actual-confirm',
  })
  if (production.length > 0) sections.push({ key: 'production', label: '我的生产任务', description: '只显示当前账号可执行的生产命令', items: production })

  if (canRead(permissions, 'quality')) {
    const qualityItems: RoleTaskItem[] = []
    if (canUpdate(permissions, 'qualityDecision')) qualityItems.push(
      { key: 'quality-pending', label: '待检任务', description: '录入抽样结果并完成判定', value: summary.pendingQualityInspectionCount, tone: 'yellow', functionKey: 'qualityTasks', task: 'quality-pending' },
    )
    if (canUpdate(permissions, 'qualityDisposition') || canUpdate(permissions, 'qualityRelease')) qualityItems.push(
      { key: 'quality-disposition', label: '待处置批次', description: '复检、返工、报废或授权放行', value: summary.qualityDispositionCount, tone: 'red', functionKey: 'qualityTasks', task: 'quality-disposition' },
    )
    if (qualityItems.length > 0) sections.push({
    key: 'quality',
    label: '我的质量任务',
    description: '待检、冻结与返工批次按独立动作权限处理',
    items: qualityItems,
  })
  }

  if (canRead(permissions, 'equipmentInspections') && canUpdate(permissions, 'equipmentInspections')) sections.push({
    key: 'equipment', label: '我的设备任务', description: '按工作中心范围执行已到期的设备点检',
    items: [{ key: 'equipment-inspection-due', label: '到期点检', description: '逐项记录标准、实测值和异常说明', value: summary.dueEquipmentInspectionCount, tone: 'orange', functionKey: 'equipmentInspections', task: 'equipment-inspection-due' }],
  })

  const warehouse: RoleTaskItem[] = []
  if (canUpdate(permissions, 'materialIn')) warehouse.push({ key: 'material-in', label: '待收货', description: '核对供应商、数量和炉批', value: summary.pendingMaterialInCount, tone: 'yellow', functionKey: 'materialIn', task: 'material-in' })
  if (canUpdate(permissions, 'shipment')) warehouse.push({ key: 'shipment', label: '待发货', description: '复核客户、库位和实际批次', value: summary.pendingShipmentCount, tone: 'orange', functionKey: 'shipment', task: 'shipment' })
  if (canUpdate(permissions, 'return')) warehouse.push({ key: 'return', label: '退货待收货', description: '核对原发货单并转入待检', value: summary.pendingReturnCount, tone: 'red', functionKey: 'return', task: 'return' })
  if (warehouse.length > 0) sections.push({ key: 'warehouse', label: '我的仓库任务', description: '收、发、退作业直接进入对应待办', items: warehouse })

  if (canUpdate(permissions, 'operators')) sections.push({
    key: 'system', label: '系统待办', description: '仅管理员或人员审核岗位可见',
    items: [{ key: 'operator-approval', label: '待审核账号', description: '复核身份、状态和岗位权限组', value: summary.pendingOperatorCount, tone: 'emerald', functionKey: 'operators', task: 'operator-approval' }],
  })
  return sections
}
