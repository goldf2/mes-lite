import type { WorkspaceFunctionKey } from './workspace'
import type { WorkspaceNavigationGroupKey } from './workspace-navigation-config'

export type PageModuleKind = 'workspace' | 'resource' | 'master-detail' | 'transaction' | 'settings' | 'utility'
export type PageOpenMode = 'page' | 'dialog' | 'inline'

export interface PagePresentationDefinition {
  navigation: 'page'
  content: 'page' | 'dialog'
  command: 'inline'
}

export const applicationTabs = [
  'dashboard', 'allFunctions', 'orders', 'materials', 'workInstructions', 'equipment', 'materialIn',
  'dispatch', 'stocks', 'stockMovements', 'qualityTasks', 'salesOrders', 'shipment', 'return', 'flowTransfers', 'sawingCost', 'scanPrint',
  'suppliers', 'customers', 'employees', 'processTemplates', 'processRoutes', 'archive', 'auditLogs',
  'dataTools', 'unitSettings', 'locationSettings', 'workCenters', 'documentCategories', 'businessSettings',
  'displaySettings', 'navigationSettings', 'aiSettings', 'operators', 'permissionUsers', 'permissionGroups',
  'create', 'detail',
] as const

export type ApplicationTab = (typeof applicationTabs)[number]

export const materialPageSections = ['materials', 'bomWorkspace', 'bomUsage'] as const
export type MaterialPageSection = (typeof materialPageSections)[number]

export type RegisteredSystemSection =
  | 'suppliers'
  | 'customers'
  | 'processTemplates'
  | 'process'
  | 'recycle'
  | 'audit'
  | 'dataTools'
  | 'units'
  | 'locations'
  | 'workCenters'
  | 'businessSettings'
  | 'displaySettings'
  | 'navigationSettings'
  | 'aiSettings'

export type PageRendererKey =
  | 'dashboard'
  | 'all-functions'
  | 'production-orders'
  | 'stocks'
  | 'stock-movements'
  | 'quality-tasks'
  | 'materials'
  | 'bom-workspace'
  | 'bom-usage'
  | 'work-instructions'
  | 'document-categories'
  | 'equipment'
  | 'material-in'
  | 'dispatch'
  | 'sales-orders'
  | 'shipment'
  | 'return'
  | 'flow-transfers'
  | 'employees'
  | 'sawing-cost'
  | 'scan-print'
  | 'operators'
  | 'system-section'
  | 'permission-users'
  | 'permission-groups'

export interface PageModuleDefinition {
  key: string
  tab: ApplicationTab
  materialSection?: MaterialPageSection
  kind: PageModuleKind
  title: string
  description: string
  toolbar: 'required' | 'none'
  renderer: PageRendererKey
  groupKey: WorkspaceNavigationGroupKey
  resource: string
  extraResource?: string
  primaryNavigation?: boolean
  tabLabel?: string
  systemSection?: RegisteredSystemSection
  hostToolbarProvided?: boolean
  shellToolbarActions?: boolean
  presentation?: Partial<PagePresentationDefinition>
  workspace?: {
    functionKey: WorkspaceFunctionKey
    label: string
    icon: string
  }
}

function registerPage<const T extends Omit<PageModuleDefinition, 'toolbar'>>(definition: T) {
  return { toolbar: 'required' as const, ...definition }
}

const registeredPages = [
  registerPage({ key: 'dashboard', tab: 'dashboard', kind: 'workspace', title: '仪表盘', description: '查看业务、生产和库存总览', renderer: 'dashboard', groupKey: 'workspace', resource: 'dashboard', primaryNavigation: true, hostToolbarProvided: true, shellToolbarActions: true, presentation: { content: 'page' }, workspace: { functionKey: 'dashboard', label: '仪表盘', icon: '仪' } }),
  registerPage({ key: 'allFunctions', tab: 'allFunctions', kind: 'workspace', title: '所有功能', description: '系统功能导航与个人工作台', renderer: 'all-functions', groupKey: 'workspace', resource: 'dashboard', primaryNavigation: true, hostToolbarProvided: true, presentation: { content: 'page' } }),
  registerPage({ key: 'materialManagement', tab: 'materials', materialSection: 'materials', kind: 'master-detail', title: '物料管理', description: '维护物料、单位、规格和库存基础', renderer: 'materials', groupKey: 'materials', resource: 'materials', primaryNavigation: true, tabLabel: '物料与 BOM', workspace: { functionKey: 'materialManagement', label: '物料管理', icon: '料' } }),
  registerPage({ key: 'bomWorkspace', tab: 'materials', materialSection: 'bomWorkspace', kind: 'master-detail', title: 'BOM 设置', description: '创建 BOM 或修改已有 BOM 的整批输入与输出', renderer: 'bom-workspace', groupKey: 'materials', resource: 'materials', extraResource: 'bomCost', presentation: { content: 'page' }, workspace: { functionKey: 'bomWorkspace', label: 'BOM 设置', icon: '本' } }),
  registerPage({ key: 'bomUsage', tab: 'materials', materialSection: 'bomUsage', kind: 'master-detail', title: 'BOM 全览', description: '查看与某个物料有关的全部产出和投入 BOM', renderer: 'bom-usage', groupKey: 'materials', resource: 'bomCost', workspace: { functionKey: 'bomUsage', label: 'BOM 全览', icon: '查' } }),
  registerPage({ key: 'workInstructions', tab: 'workInstructions', kind: 'master-detail', title: '产品文档', description: '管理图纸、PDF 和作业指导文档', renderer: 'work-instructions', groupKey: 'documents', resource: 'workInstructions', primaryNavigation: true, workspace: { functionKey: 'workInstructions', label: '产品文档', icon: '书' } }),
  registerPage({ key: 'equipment', tab: 'equipment', kind: 'resource', title: '设备台账', description: '维护设备、状态、工作中心归属和基础参数', renderer: 'equipment', groupKey: 'equipment', resource: 'equipment', primaryNavigation: true, workspace: { functionKey: 'equipment', label: '设备台账', icon: '机' } }),
  registerPage({ key: 'orders', tab: 'orders', kind: 'transaction', title: '生产订单', description: '先保存生产计划，班后再登记实际产量', renderer: 'production-orders', groupKey: 'production', resource: 'orders', primaryNavigation: true, hostToolbarProvided: true, presentation: { content: 'page' }, workspace: { functionKey: 'orders', label: '生产订单', icon: '工' } }),
  registerPage({ key: 'dispatch', tab: 'dispatch', kind: 'transaction', title: '派工管理', description: '将生产任务派发到人员与工作中心', renderer: 'dispatch', groupKey: 'production', resource: 'dispatch', primaryNavigation: true, workspace: { functionKey: 'dispatch', label: '派工管理', icon: '派' } }),
  registerPage({ key: 'flowTransfers', tab: 'flowTransfers', kind: 'transaction', title: '流程转移', description: '同一物料在库位或流程节点之间转移', renderer: 'flow-transfers', groupKey: 'production', resource: 'stats', primaryNavigation: true, workspace: { functionKey: 'flowTransfers', label: '流程转移', icon: '转' } }),
  registerPage({ key: 'qualityTasks', tab: 'qualityTasks', kind: 'transaction', title: '质量任务', description: '处理待检、冻结、返工、复检、报废和授权放行', renderer: 'quality-tasks', groupKey: 'production', resource: 'quality', primaryNavigation: true, workspace: { functionKey: 'qualityTasks', label: '质量任务', icon: '质' } }),
  registerPage({ key: 'materialIn', tab: 'materialIn', kind: 'transaction', title: '来料管理', description: '登记供应商来料、实测和采购计价', renderer: 'material-in', groupKey: 'logistics', resource: 'materialIn', primaryNavigation: true, workspace: { functionKey: 'materialIn', label: '来料管理', icon: '入' } }),
  registerPage({ key: 'salesOrders', tab: 'salesOrders', kind: 'transaction', title: '销售订单', description: '登记客户需求并跟踪订单发货进度', renderer: 'sales-orders', groupKey: 'sales', resource: 'salesOrder', primaryNavigation: true, workspace: { functionKey: 'salesOrders', label: '销售订单', icon: '销' } }),
  registerPage({ key: 'shipment', tab: 'shipment', kind: 'transaction', title: '发货管理', description: '独立登记发货，可选关联销售订单并在确认后扣减库存', renderer: 'shipment', groupKey: 'sales', resource: 'shipment', primaryNavigation: true, workspace: { functionKey: 'shipment', label: '发货管理', icon: '发' } }),
  registerPage({ key: 'return', tab: 'return', kind: 'transaction', title: '退货管理', description: '登记退货、审核并处理返库', renderer: 'return', groupKey: 'sales', resource: 'return', primaryNavigation: true, workspace: { functionKey: 'return', label: '退货管理', icon: '退' } }),
  registerPage({ key: 'stocks', tab: 'stocks', kind: 'master-detail', title: '库存管理', description: '查看库存、库位余额和成本', renderer: 'stocks', groupKey: 'inventory', resource: 'stocks', primaryNavigation: true, hostToolbarProvided: true, presentation: { content: 'page' }, workspace: { functionKey: 'stocks', label: '库存管理', icon: '库' } }),
  registerPage({ key: 'stockMovements', tab: 'stockMovements', kind: 'transaction', title: '库存流水', description: '追踪库存、核算数量和成本的每次变化及业务来源', renderer: 'stock-movements', groupKey: 'inventory', resource: 'stocks', primaryNavigation: true, workspace: { functionKey: 'stockMovements', label: '库存流水', icon: '流' } }),
  registerPage({ key: 'suppliers', tab: 'suppliers', kind: 'resource', title: '供应商资料', description: '维护供应商基础资料', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'suppliers', workspace: { functionKey: 'suppliers', label: '供应商资料', icon: '供' } }),
  registerPage({ key: 'customers', tab: 'customers', kind: 'resource', title: '客户资料', description: '维护客户基础资料', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'customers', workspace: { functionKey: 'customers', label: '客户资料', icon: '客' } }),
  registerPage({ key: 'employees', tab: 'employees', kind: 'resource', title: '员工资料', description: '维护业务员工并供生产和转移单据选用', renderer: 'employees', groupKey: 'configuration', resource: 'system', primaryNavigation: true, workspace: { functionKey: 'employees', label: '员工资料', icon: '员' } }),
  registerPage({ key: 'locationSettings', tab: 'locationSettings', kind: 'settings', title: '库位配置', description: '配置库位、用途和默认库位', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'locations', workspace: { functionKey: 'locationSettings', label: '库位配置', icon: '位' } }),
  registerPage({ key: 'unitSettings', tab: 'unitSettings', kind: 'settings', title: '单位配置', description: '配置计量单位和同量纲换算', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'units', workspace: { functionKey: 'unitSettings', label: '单位配置', icon: '单' } }),
  registerPage({ key: 'documentCategories', tab: 'documentCategories', kind: 'settings', title: '文档类别', description: '维护产品文档使用的一级、二级业务分类', renderer: 'document-categories', groupKey: 'configuration', resource: 'workInstructions', primaryNavigation: true, workspace: { functionKey: 'documentCategories', label: '文档类别', icon: '类' } }),
  registerPage({ key: 'workCenters', tab: 'workCenters', kind: 'settings', title: '工作中心', description: '配置锯切、钻孔、检验等生产能力区域', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'workCenters', workspace: { functionKey: 'workCenters', label: '工作中心', icon: '中' } }),
  registerPage({ key: 'processTemplates', tab: 'processTemplates', kind: 'settings', title: '加工工艺', description: '维护加工工艺模板和成本参数', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'processTemplates', workspace: { functionKey: 'processTemplates', label: '加工工艺', icon: '艺' } }),
  registerPage({ key: 'processRoutes', tab: 'processRoutes', kind: 'settings', title: '物料路线', description: '维护产品加工路线和工步', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'process', workspace: { functionKey: 'processRoutes', label: '物料路线', icon: '线' } }),
  registerPage({ key: 'businessSettings', tab: 'businessSettings', kind: 'settings', title: '企业与业务规则', description: '维护企业资料和跨终端业务规则', renderer: 'system-section', groupKey: 'configuration', resource: 'system', primaryNavigation: true, systemSection: 'businessSettings', workspace: { functionKey: 'businessSettings', label: '企业与业务规则', icon: '业' } }),
  registerPage({ key: 'displaySettings', tab: 'displaySettings', kind: 'settings', title: '显示设置', description: '维护配色、对比度和界面显示效果', renderer: 'system-section', groupKey: 'system', resource: 'system', primaryNavigation: true, systemSection: 'displaySettings', workspace: { functionKey: 'displaySettings', label: '显示设置', icon: '显' } }),
  registerPage({ key: 'navigationSettings', tab: 'navigationSettings', kind: 'settings', title: '导航与工作区', description: '配置 MES、MRP、ERP 菜单唯一归属、名称和顺序', renderer: 'system-section', groupKey: 'system', resource: 'system', primaryNavigation: true, systemSection: 'navigationSettings', workspace: { functionKey: 'navigationSettings', label: '导航与工作区', icon: '导' } }),
  registerPage({ key: 'aiSettings', tab: 'aiSettings', kind: 'settings', title: 'AI 服务', description: '维护 AI 模型、接口、密钥和助手外观', renderer: 'system-section', groupKey: 'system', resource: 'system', primaryNavigation: true, systemSection: 'aiSettings', workspace: { functionKey: 'aiSettings', label: 'AI 服务', icon: '智' } }),
  registerPage({ key: 'sawingCost', tab: 'sawingCost', kind: 'utility', title: '锯切成本', description: '计算锯切、损耗和直接加工成本', renderer: 'sawing-cost', groupKey: 'tools', resource: 'sawingCost', primaryNavigation: true, hostToolbarProvided: true, shellToolbarActions: true, workspace: { functionKey: 'sawingCost', label: '锯切成本', icon: '锯' } }),
  registerPage({ key: 'scanPrint', tab: 'scanPrint', kind: 'utility', title: '硬件工具', description: '使用扫码计数和标签测试打印', renderer: 'scan-print', groupKey: 'tools', resource: 'scanPrint', primaryNavigation: true, hostToolbarProvided: true, shellToolbarActions: true, workspace: { functionKey: 'scanPrint', label: '硬件工具', icon: '扫' } }),
  registerPage({ key: 'archive', tab: 'archive', kind: 'settings', title: '归档记录', description: '恢复或永久删除已归档记录', renderer: 'system-section', groupKey: 'tools', resource: 'system', primaryNavigation: true, systemSection: 'recycle', workspace: { functionKey: 'archive', label: '归档记录', icon: '档' } }),
  registerPage({ key: 'auditLogs', tab: 'auditLogs', kind: 'settings', title: '操作记录', description: '查看业务和系统操作审计记录', renderer: 'system-section', groupKey: 'tools', resource: 'system', primaryNavigation: true, systemSection: 'audit', workspace: { functionKey: 'auditLogs', label: '操作记录', icon: '记' } }),
  registerPage({ key: 'dataTools', tab: 'dataTools', kind: 'utility', title: '数据工具', description: '执行数据检查和可控的错误数据清理', renderer: 'system-section', groupKey: 'tools', resource: 'system', primaryNavigation: true, systemSection: 'dataTools', hostToolbarProvided: true, shellToolbarActions: true, presentation: { content: 'page' }, workspace: { functionKey: 'dataTools', label: '数据工具', icon: '数' } }),
  registerPage({ key: 'operators', tab: 'operators', kind: 'settings', title: '人员管理', description: '审核、启停和维护操作人员', renderer: 'operators', groupKey: 'account', resource: 'operators', primaryNavigation: true, workspace: { functionKey: 'operators', label: '人员管理', icon: '人' } }),
  registerPage({ key: 'permissionUsers', tab: 'permissionUsers', kind: 'settings', title: '人员权限', description: '为人员分配权限组和个人权限', renderer: 'permission-users', groupKey: 'account', resource: 'permissionUsers', primaryNavigation: true, workspace: { functionKey: 'permissionUsers', label: '人员权限', icon: '权' } }),
  registerPage({ key: 'permissionGroups', tab: 'permissionGroups', kind: 'settings', title: '组权限', description: '维护可复用的权限组', renderer: 'permission-groups', groupKey: 'account', resource: 'permissionGroups', primaryNavigation: true, workspace: { functionKey: 'permissionGroups', label: '组权限', icon: '组' } }),
  registerPage({ key: 'create', tab: 'create', kind: 'transaction', title: '新增生产订单', description: '生产订单录入', renderer: 'production-orders', groupKey: 'production', resource: 'orders', hostToolbarProvided: true }),
  registerPage({ key: 'detail', tab: 'detail', kind: 'transaction', title: '生产订单详情', description: '生产订单与实绩详情', renderer: 'production-orders', groupKey: 'production', resource: 'orders', hostToolbarProvided: true }),
] as const satisfies readonly PageModuleDefinition[]

export type RegisteredPageKey = (typeof registeredPages)[number]['key']
export const registeredPageDefinitions: readonly PageModuleDefinition[] = registeredPages

export const pageNavigationGroups: ReadonlyArray<{ key: WorkspaceNavigationGroupKey; label: string }> = [
  { key: 'workspace', label: '工作台' },
  { key: 'materials', label: '物料' },
  { key: 'production', label: '生产' },
  { key: 'documents', label: '文档' },
  { key: 'equipment', label: '设备' },
  { key: 'logistics', label: '物流' },
  { key: 'sales', label: '销售' },
  { key: 'inventory', label: '库存' },
  { key: 'configuration', label: '业务配置' },
  { key: 'system', label: '系统设置' },
  { key: 'tools', label: '工具' },
  { key: 'account', label: '账号与权限' },
]

const pageByKey = new Map<string, PageModuleDefinition>(registeredPageDefinitions.map((definition) => [definition.key, definition]))

export function getRegisteredPageDefinition(key: string): PageModuleDefinition {
  return pageByKey.get(key) || {
    key,
    tab: 'dashboard',
    kind: 'resource',
    title: key,
    description: '未分类功能页面',
    toolbar: 'required',
    renderer: 'dashboard',
    groupKey: 'workspace',
    resource: 'dashboard',
  }
}

export function resolveRegisteredPageKey(tab: string, materialSection?: string) {
  if (tab === 'materials') {
    return registeredPageDefinitions.find((definition) => definition.tab === tab && definition.materialSection === materialSection)?.key
      || 'materialManagement'
  }
  return registeredPageDefinitions.find((definition) => definition.tab === tab)?.key || tab
}
