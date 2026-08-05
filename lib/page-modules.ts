export type PageModuleKind = 'workspace' | 'resource' | 'master-detail' | 'transaction' | 'settings' | 'utility'

export interface PageModuleDefinition {
  key: string
  kind: PageModuleKind
  title: string
  description: string
}

const definitions = [
  { key: 'dashboard', kind: 'workspace', title: '仪表盘', description: '业务、生产与库存总览' },
  { key: 'allFunctions', kind: 'workspace', title: '所有功能', description: '系统功能导航与个人工作台' },
  { key: 'materialManagement', kind: 'master-detail', title: '物料管理', description: '物料列表、详情与基础资料维护' },
  { key: 'bomWorkspace', kind: 'master-detail', title: 'BOM 设置', description: 'BOM 输入、输出与版本维护' },
  { key: 'bomUsage', kind: 'master-detail', title: 'BOM 全览', description: '物料关联 BOM 查询' },
  { key: 'workInstructions', kind: 'master-detail', title: '产品文档', description: '文档、附件与关联对象管理' },
  { key: 'equipment', kind: 'resource', title: '设备台账', description: '设备资源维护' },
  { key: 'orders', kind: 'transaction', title: '生产订单', description: '生产计划与班后实绩' },
  { key: 'flowTransfers', kind: 'transaction', title: '流程转移', description: '流程节点与库位转移' },
  { key: 'dispatch', kind: 'transaction', title: '派工管理', description: '生产任务派工' },
  { key: 'materialIn', kind: 'transaction', title: '来料管理', description: '来料登记、计价与入库' },
  { key: 'salesOrders', kind: 'transaction', title: '销售订单', description: '客户订单与交付进度' },
  { key: 'shipment', kind: 'transaction', title: '发货管理', description: '销售发货与库存扣减' },
  { key: 'return', kind: 'transaction', title: '退货管理', description: '退货审核与返库' },
  { key: 'stocks', kind: 'master-detail', title: '库存管理', description: '库存、库位与成本查询' },
  { key: 'suppliers', kind: 'resource', title: '供应商资料', description: '供应商主数据维护' },
  { key: 'customers', kind: 'resource', title: '客户资料', description: '客户主数据维护' },
  { key: 'employees', kind: 'resource', title: '员工资料', description: '业务员工与账号关联' },
  { key: 'locationSettings', kind: 'settings', title: '库位配置', description: '库位与用途配置' },
  { key: 'unitSettings', kind: 'settings', title: '单位配置', description: '计量单位与换算配置' },
  { key: 'workCenters', kind: 'settings', title: '工作中心', description: '生产能力区域配置' },
  { key: 'processTemplates', kind: 'settings', title: '加工工艺', description: '工艺模板与成本参数' },
  { key: 'processRoutes', kind: 'settings', title: '物料路线', description: '产品路线与工步配置' },
  { key: 'systemSettings', kind: 'settings', title: '系统设置', description: '编码、排序与界面偏好' },
  { key: 'sawingCost', kind: 'utility', title: '锯切成本', description: '锯切损耗与加工成本计算' },
  { key: 'scanPrint', kind: 'utility', title: '硬件工具', description: '扫码计数与标签测试' },
  { key: 'archive', kind: 'settings', title: '归档记录', description: '归档数据恢复与清理' },
  { key: 'auditLogs', kind: 'settings', title: '操作记录', description: '业务与系统审计记录' },
  { key: 'dataTools', kind: 'utility', title: '数据工具', description: '数据检查与受控清理' },
  { key: 'operators', kind: 'settings', title: '人员管理', description: '账号审核、启停与维护' },
  { key: 'permissionUsers', kind: 'settings', title: '人员权限', description: '人员权限分配' },
  { key: 'permissionGroups', kind: 'settings', title: '组权限', description: '权限组维护' },
  { key: 'create', kind: 'transaction', title: '新增生产订单', description: '生产订单录入' },
  { key: 'detail', kind: 'transaction', title: '生产订单详情', description: '生产订单与实绩详情' },
] as const satisfies readonly PageModuleDefinition[]

export const pageModuleDefinitions: readonly PageModuleDefinition[] = definitions

const definitionByKey = new Map<string, PageModuleDefinition>(definitions.map((definition) => [definition.key, definition]))

export function getPageModuleDefinition(key: string): PageModuleDefinition {
  return definitionByKey.get(key) || {
    key,
    kind: 'resource',
    title: key,
    description: '未分类功能页面',
  }
}

export function resolvePageModuleKey(tab: string, materialSection?: string) {
  if (tab !== 'materials') return tab
  if (materialSection === 'bomWorkspace' || materialSection === 'bomUsage') return materialSection
  return 'materialManagement'
}
