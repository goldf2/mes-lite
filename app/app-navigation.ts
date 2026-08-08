import type { WorkspaceFunctionItem } from './components/WorkspacePages'
import type { SystemSection } from './components/SystemPage'
import type { WorkspaceNavigationGroupKey } from '@/lib/workspace-navigation-config'

export type TabType = 'dashboard' | 'allFunctions' | 'orders' | 'materials' | 'workInstructions' | 'equipment' | 'materialIn' | 'dispatch' | 'stocks' | 'salesOrders' | 'shipment' | 'return' | 'flowTransfers' | 'sawingCost' | 'scanPrint' | 'suppliers' | 'customers' | 'employees' | 'processTemplates' | 'processRoutes' | 'archive' | 'auditLogs' | 'dataTools' | 'unitSettings' | 'locationSettings' | 'workCenters' | 'documentCategories' | 'businessSettings' | 'displaySettings' | 'navigationSettings' | 'aiSettings' | 'operators' | 'permissionUsers' | 'permissionGroups' | 'create' | 'detail'

export type MaterialSection = 'materials' | 'bomWorkspace' | 'bomUsage'

export interface PageContinuityState {
  tab?: TabType
  materialSection?: MaterialSection
  scrollPositions?: Record<string, { contentTop: number; windowTop: number }>
}

export function readPageContinuity(storageKey: string): PageContinuityState {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PageContinuityState
      : {}
  } catch {
    return {}
  }
}

export function writePageContinuity(storageKey: string, update: Partial<PageContinuityState>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...readPageContinuity(storageKey),
      ...update,
    }))
  } catch {
    // 浏览器禁用或限制本地存储时不应阻断业务页面。
  }
}

export type BusinessNavGroupKey = WorkspaceNavigationGroupKey

export const businessNavGroups: Array<{ key: BusinessNavGroupKey; label: string; tabs: TabType[] }> = [
  { key: 'workspace', label: '工作台', tabs: ['dashboard', 'allFunctions'] },
  { key: 'materials', label: '物料', tabs: ['materials'] },
  { key: 'production', label: '生产', tabs: ['orders', 'flowTransfers', 'dispatch'] },
  { key: 'documents', label: '文档', tabs: ['workInstructions'] },
  { key: 'equipment', label: '设备', tabs: ['equipment'] },
  { key: 'logistics', label: '物流', tabs: ['materialIn'] },
  { key: 'sales', label: '销售', tabs: ['salesOrders', 'shipment', 'return'] },
  { key: 'inventory', label: '库存', tabs: ['stocks'] },
  { key: 'configuration', label: '业务配置', tabs: ['suppliers', 'customers', 'employees', 'locationSettings', 'unitSettings', 'documentCategories', 'workCenters', 'processTemplates', 'processRoutes', 'businessSettings'] },
  { key: 'system', label: '系统设置', tabs: ['displaySettings', 'navigationSettings', 'aiSettings'] },
  { key: 'tools', label: '工具', tabs: ['sawingCost', 'scanPrint', 'archive', 'auditLogs', 'dataTools'] },
]

export interface WorkspaceFunctionDefinition extends WorkspaceFunctionItem {
  tab: TabType
  materialSection?: MaterialSection
  resource: string
  extraResource?: string
}

export const workspaceFunctionCatalog: WorkspaceFunctionDefinition[] = [
  { key: 'dashboard', label: '仪表盘', groupKey: 'workspace', groupLabel: '工作台', description: '查看业务、生产和库存总览', icon: '仪', tab: 'dashboard', resource: 'dashboard' },
  { key: 'materialManagement', label: '物料管理', groupKey: 'materials', groupLabel: '物料', description: '维护物料、单位、规格和库存基础', icon: '料', tab: 'materials', materialSection: 'materials', resource: 'materials' },
  { key: 'bomWorkspace', label: 'BOM 设置', groupKey: 'materials', groupLabel: '物料', description: '创建 BOM 或修改已有 BOM 的整批输入与输出', icon: '本', tab: 'materials', materialSection: 'bomWorkspace', resource: 'materials', extraResource: 'bomCost' },
  { key: 'bomUsage', label: 'BOM 全览', groupKey: 'materials', groupLabel: '物料', description: '查看与某个物料有关的全部产出和投入 BOM', icon: '查', tab: 'materials', materialSection: 'bomUsage', resource: 'bomCost' },
  { key: 'workInstructions', label: '产品文档', groupKey: 'documents', groupLabel: '文档', description: '管理图纸、PDF 和作业指导文档', icon: '书', tab: 'workInstructions', resource: 'workInstructions' },
  { key: 'equipment', label: '设备台账', groupKey: 'equipment', groupLabel: '设备', description: '维护设备、状态、工作中心归属和基础参数', icon: '机', tab: 'equipment', resource: 'equipment' },
  { key: 'orders', label: '生产订单', groupKey: 'production', groupLabel: '生产', description: '先保存生产计划，班后再登记实际产量', icon: '工', tab: 'orders', resource: 'orders' },
  { key: 'dispatch', label: '派工管理', groupKey: 'production', groupLabel: '生产', description: '将生产任务派发到人员与工作中心', icon: '派', tab: 'dispatch', resource: 'dispatch' },
  { key: 'flowTransfers', label: '流程转移', groupKey: 'production', groupLabel: '生产', description: '同一物料在库位或流程节点之间转移', icon: '转', tab: 'flowTransfers', resource: 'stats' },
  { key: 'materialIn', label: '来料管理', groupKey: 'logistics', groupLabel: '物流', description: '登记供应商来料、实测和采购计价', icon: '入', tab: 'materialIn', resource: 'materialIn' },
  { key: 'salesOrders', label: '销售订单', groupKey: 'sales', groupLabel: '销售', description: '登记客户需求并跟踪订单发货进度', icon: '销', tab: 'salesOrders', resource: 'salesOrder' },
  { key: 'shipment', label: '发货管理', groupKey: 'sales', groupLabel: '销售', description: '独立登记发货，可选关联销售订单并在确认后扣减库存', icon: '发', tab: 'shipment', resource: 'shipment' },
  { key: 'return', label: '退货管理', groupKey: 'sales', groupLabel: '销售', description: '登记退货、审核并处理返库', icon: '退', tab: 'return', resource: 'return' },
  { key: 'stocks', label: '库存管理', groupKey: 'inventory', groupLabel: '库存', description: '查看库存、库位余额和成本', icon: '库', tab: 'stocks', resource: 'stocks' },
  { key: 'suppliers', label: '供应商资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护供应商基础资料', icon: '供', tab: 'suppliers', resource: 'system' },
  { key: 'customers', label: '客户资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护客户基础资料', icon: '客', tab: 'customers', resource: 'system' },
  { key: 'employees', label: '员工资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护业务员工并供生产和转移单据选用', icon: '员', tab: 'employees', resource: 'system' },
  { key: 'locationSettings', label: '库位配置', groupKey: 'configuration', groupLabel: '业务配置', description: '配置库位、用途和默认库位', icon: '位', tab: 'locationSettings', resource: 'system' },
  { key: 'unitSettings', label: '单位配置', groupKey: 'configuration', groupLabel: '业务配置', description: '配置计量单位和同量纲换算', icon: '单', tab: 'unitSettings', resource: 'system' },
  { key: 'documentCategories', label: '文档类别', groupKey: 'configuration', groupLabel: '业务配置', description: '维护产品文档使用的一级、二级业务分类', icon: '类', tab: 'documentCategories', resource: 'workInstructions' },
  { key: 'workCenters', label: '工作中心', groupKey: 'configuration', groupLabel: '业务配置', description: '配置锯切、钻孔、检验等生产能力区域', icon: '中', tab: 'workCenters', resource: 'system' },
  { key: 'processTemplates', label: '加工工艺', groupKey: 'configuration', groupLabel: '业务配置', description: '维护加工工艺模板和成本参数', icon: '艺', tab: 'processTemplates', resource: 'system' },
  { key: 'processRoutes', label: '物料路线', groupKey: 'configuration', groupLabel: '业务配置', description: '维护产品加工路线和工步', icon: '线', tab: 'processRoutes', resource: 'system' },
  { key: 'businessSettings', label: '企业与业务规则', groupKey: 'configuration', groupLabel: '业务配置', description: '维护企业资料和跨终端业务规则', icon: '业', tab: 'businessSettings', resource: 'system' },
  { key: 'displaySettings', label: '显示设置', groupKey: 'system', groupLabel: '系统设置', description: '维护配色、对比度和界面显示效果', icon: '显', tab: 'displaySettings', resource: 'system' },
  { key: 'navigationSettings', label: '导航与工作区', groupKey: 'system', groupLabel: '系统设置', description: '配置 MES、MRP、ERP 菜单唯一归属、名称和顺序', icon: '导', tab: 'navigationSettings', resource: 'system' },
  { key: 'aiSettings', label: 'AI 服务', groupKey: 'system', groupLabel: '系统设置', description: '维护 AI 模型、接口、密钥和助手外观', icon: '智', tab: 'aiSettings', resource: 'system' },
  { key: 'sawingCost', label: '锯切成本', groupKey: 'tools', groupLabel: '工具', description: '计算锯切、损耗和直接加工成本', icon: '锯', tab: 'sawingCost', resource: 'sawingCost' },
  { key: 'scanPrint', label: '硬件工具', groupKey: 'tools', groupLabel: '工具', description: '使用扫码计数和标签测试打印', icon: '扫', tab: 'scanPrint', resource: 'scanPrint' },
  { key: 'archive', label: '归档记录', groupKey: 'tools', groupLabel: '工具', description: '恢复或永久删除已归档记录', icon: '档', tab: 'archive', resource: 'system' },
  { key: 'auditLogs', label: '操作记录', groupKey: 'tools', groupLabel: '工具', description: '查看业务和系统操作审计记录', icon: '记', tab: 'auditLogs', resource: 'system' },
  { key: 'dataTools', label: '数据工具', groupKey: 'tools', groupLabel: '工具', description: '执行数据检查和可控的错误数据清理', icon: '数', tab: 'dataTools', resource: 'system' },
  { key: 'operators', label: '人员管理', groupKey: 'account', groupLabel: '账号与权限', description: '审核、启停和维护操作人员', icon: '人', tab: 'operators', resource: 'operators' },
  { key: 'permissionUsers', label: '人员权限', groupKey: 'account', groupLabel: '账号与权限', description: '为人员分配权限组和个人权限', icon: '权', tab: 'permissionUsers', resource: 'permissionUsers' },
  { key: 'permissionGroups', label: '组权限', groupKey: 'account', groupLabel: '账号与权限', description: '维护可复用的权限组', icon: '组', tab: 'permissionGroups', resource: 'permissionGroups' },
]

export const systemSectionByTab: Partial<Record<TabType, SystemSection>> = {
  suppliers: 'suppliers',
  customers: 'customers',
  processTemplates: 'processTemplates',
  processRoutes: 'process',
  archive: 'recycle',
  auditLogs: 'audit',
  dataTools: 'dataTools',
  unitSettings: 'units',
  locationSettings: 'locations',
  workCenters: 'workCenters',
  businessSettings: 'businessSettings',
  displaySettings: 'displaySettings',
  navigationSettings: 'navigationSettings',
  aiSettings: 'aiSettings',
}

export const lightweightHiddenResources = new Set<string>(['dispatch'])
