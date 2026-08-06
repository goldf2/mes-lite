'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Boxes, Menu, PencilLine, Search, X } from 'lucide-react'
import AuthGate, { CurrentOperator, OperatorBadge } from './components/AuthGate'
import StatusCheckboxFilter, { getMultiSelectQuery, getStatusQuery } from './components/StatusCheckboxFilter'
import ResponsiveToolbarActions from './components/ResponsiveToolbarActions'
import ViewModeToggle, { usePersistedViewMode } from './components/ViewModeToggle'
import { InterfacePreferenceSync, preferenceChangeEvent, readDesktopNavigationPreference } from './components/interfacePreferences'
import { SearchFieldWithPresets } from './components/SavedSearchPresets'
import SearchableSelect from './components/SearchableSelect'
import SortableTableHeader from './components/SortableTableHeader'
import useClientTableSort from './components/useClientTableSort'
import AppButton from './components/AppButton'
import ModalDialog, { ModalActions } from './components/ModalDialog'
import AiAssistantMark from './components/AiAssistantMark'
import AppLoadingIndicator from './components/AppLoadingIndicator'
import { AllFunctionsPage, WorkspaceLauncher } from './components/WorkspacePages'
import type { WorkspaceFunctionItem } from './components/WorkspacePages'
import type { SystemSection } from './components/SystemPage'
import {
  defaultWorkspacePreference,
  isWorkspaceFunctionKey,
} from '@/lib/workspace'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import { getPageModuleDefinition, resolvePageModuleKey } from '@/lib/page-modules'
import PageModuleBoundary from './components/page-modules/PageModuleBoundary'
import TopBarPortal from './components/TopBarPortal'
import DesktopNavigation, {
  type DesktopNavigationDisplayMode,
  type DesktopNavigationGroup,
  type DesktopNavigationMode,
} from './components/navigation/DesktopNavigation'
import PageQrCodeButton from './components/PageQrCodeButton'

function FeaturePageLoading() {
  return <AppLoadingIndicator label="正在加载页面..." />
}

const MaterialInPage = dynamic(() => import('./components/MaterialInPage'), { loading: FeaturePageLoading })
const DispatchPage = dynamic(() => import('./components/DispatchPage'), { loading: FeaturePageLoading })
const SalesOrderPage = dynamic(() => import('./components/SalesOrderPage'), { loading: FeaturePageLoading })
const ShipmentPage = dynamic(() => import('./components/ShipmentPage'), { loading: FeaturePageLoading })
const ReturnPage = dynamic(() => import('./components/ReturnPage'), { loading: FeaturePageLoading })
const FlowTransferPage = dynamic(() => import('./components/FlowTransferPage'), { loading: FeaturePageLoading })
const EmployeePage = dynamic(() => import('./components/EmployeePage'), { loading: FeaturePageLoading })
const SawingCostCalculatorPage = dynamic(() => import('./components/SawingCostCalculatorPage'), { loading: FeaturePageLoading })
const ScanPrintPage = dynamic(() => import('./components/ScanPrintPage'), { loading: FeaturePageLoading })
const BomOverviewPage = dynamic(() => import('./components/BomOverviewPage'), { loading: FeaturePageLoading })
const MaterialPage = dynamic(() => import('./components/MaterialPage'), { loading: FeaturePageLoading })
const WorkInstructionPage = dynamic(() => import('./components/WorkInstructionPage'), { loading: FeaturePageLoading })
const EquipmentPage = dynamic(() => import('./components/EquipmentPage'), { loading: FeaturePageLoading })
const AttachmentPanel = dynamic(() => import('./components/AttachmentPanel'), { loading: FeaturePageLoading })
const ProductionOrderActualPanel = dynamic(() => import('./components/ProductionOrderActualPanel'), { loading: FeaturePageLoading })
const OperatorPage = dynamic(() => import('./components/OperatorPage'), { loading: FeaturePageLoading })
const SystemPage = dynamic(() => import('./components/SystemPage'), { loading: FeaturePageLoading })
const PermissionPage = dynamic(() => import('./components/PermissionPage'), { loading: FeaturePageLoading })
const AiAssistantPanel = dynamic(() => import('./components/AiAssistantPanel'))

// ==================== 类型定义 ====================

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string
  category: string
  stockUnit: string
  valuationUnit: string
}

interface OrderBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
}

interface OrderMaterialOption extends MaterialOption {
  boms: OrderBomOption[]
}

interface Customer {
  id: string
  code: string
  name: string
}

interface InventoryLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
  isActive: boolean
}

interface StockLocationBalance {
  id: string
  locationId: string
  qty: number
  reservedQty: number
  availableQty: number
  location: InventoryLocationOption
}

interface PackagingMaterialRef {
  id: string
  code: string
  name: string
  category: string
  stockUnit: string
}

interface PackagingDefinition {
  bom: { id: string; name: string; version: string }
  outputQuantity: number
  outputUnit: string
  contents: Array<{ material: PackagingMaterialRef; quantity: number }>
}

interface PackagingInventorySource {
  stockId: string
  material: PackagingMaterialRef
  qty: number
  equivalentQty: number
  ratio: number
  bom: { id: string; name: string; version: string }
  locations: Array<{
    locationId: string
    code: string
    name: string
    qty: number
    equivalentQty: number
  }>
}

interface PackagingInventorySummary {
  material: PackagingMaterialRef
  packagedEquivalentQty: number
  sources: PackagingInventorySource[]
}

interface Stock {
  id: string
  qty: number
  reservedQty: number
  availableQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  totalCost: number
  valuationUnitCost: number
  stockUnitCost: number
  locationBalances: StockLocationBalance[]
  packagingDefinition?: PackagingDefinition | null
  packagingSummary?: PackagingInventorySummary | null
  material?: { id: string; code: string; name: string; spec: string; category?: string; customerId?: string | null; customer?: Customer | null; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number; deletedAt?: string | null; primaryImage?: { id: string; url: string; thumbnailUrl?: string; displayUrl?: string; originalUrl?: string; note?: string | null; mimeType: string; isCover: boolean } | null }
  product?: { id: string; sku: string; name: string; category: string; customerId?: string | null; customer?: Customer | null; unit: string }
}

function stockQuantityText(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

interface StockIntegrityIssue {
  type?: string
  message?: string
  records?: Array<{ id?: string; code?: string; reasons?: string[] }>
}

const repairableStockIssueTypes = new Set(['MATERIAL_WITHOUT_STOCK', 'PRODUCT_WITHOUT_STOCK'])

function canBackfillStockIssues(issues: StockIntegrityIssue[]) {
  return issues.length > 0 && issues.every((issue) => Boolean(issue.type && repairableStockIssueTypes.has(issue.type)))
}

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

const materialCategoryOptions = [
  ['RAW', '原材料'],
  ['FINISHED', '成品'],
  ['AUXILIARY', '辅材'],
  ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'],
  ['PACKAGING', '包装物'],
  ['OTHER', '其他'],
] as const

const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

interface Order {
  id: string
  orderNo: string
  groupNo?: string | null
  lineNo?: number
  voucherNo?: string | null
  status: string
  planQty: number
  completeQty: number
  scrapQty: number
  createdAt: string
  product: { id: string; name: string; sku: string }
  targetMaterial?: { id: string; name: string; code: string; category?: string; stockUnit?: string; unit?: string } | null
  bom?: { id: string; name: string; version: string } | null
  bomName?: string | null
  bomVersion?: string | null
  _count: { reports: number; picks: number; actuals: number }
}

interface OrderDraftLine {
  id: string
  targetId: string
  bomId: string
  planQty: number
}

interface PickItem {
  id: string
  material: { id: string; code: string; name: string; unit: string; stockUnit?: string }
  requiredQty: number
  actualQty: number
  status: string
}

interface ProcessStep {
  id: string
  stepNo: number
  name: string
  workstation: string | null
}

type TabType = 'dashboard' | 'allFunctions' | 'orders' | 'materials' | 'workInstructions' | 'equipment' | 'materialIn' | 'dispatch' | 'stocks' | 'salesOrders' | 'shipment' | 'return' | 'flowTransfers' | 'sawingCost' | 'scanPrint' | 'suppliers' | 'customers' | 'employees' | 'processTemplates' | 'processRoutes' | 'archive' | 'auditLogs' | 'dataTools' | 'unitSettings' | 'locationSettings' | 'workCenters' | 'businessSettings' | 'displaySettings' | 'aiSettings' | 'operators' | 'permissionUsers' | 'permissionGroups' | 'create' | 'detail'
type MaterialSection = 'materials' | 'bomWorkspace' | 'bomUsage'

interface BomEditorTarget {
  materialId: string
  bomId?: string
  requestId: number
}

interface PageContinuityState {
  tab?: TabType
  materialSection?: MaterialSection
  scrollPositions?: Record<string, { contentTop: number; windowTop: number }>
}

function readPageContinuity(storageKey: string): PageContinuityState {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PageContinuityState
      : {}
  } catch (error) {
    return {}
  }
}

function writePageContinuity(storageKey: string, update: Partial<PageContinuityState>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...readPageContinuity(storageKey),
      ...update,
    }))
  } catch (error) {
    // 浏览器禁用或限制本地存储时不应阻断业务页面。
  }
}
type BusinessNavGroupKey = 'workspace' | 'materials' | 'production' | 'documents' | 'equipment' | 'logistics' | 'sales' | 'inventory' | 'configuration' | 'system' | 'tools'

const businessNavGroups: Array<{ key: BusinessNavGroupKey; label: string; tabs: TabType[] }> = [
  { key: 'workspace', label: '工作台', tabs: ['dashboard', 'allFunctions'] },
  { key: 'materials', label: '物料', tabs: ['materials'] },
  { key: 'production', label: '生产', tabs: ['orders', 'flowTransfers', 'dispatch'] },
  { key: 'documents', label: '文档', tabs: ['workInstructions'] },
  { key: 'equipment', label: '设备', tabs: ['equipment'] },
  { key: 'logistics', label: '物流', tabs: ['materialIn'] },
  { key: 'sales', label: '销售', tabs: ['salesOrders', 'shipment', 'return'] },
  { key: 'inventory', label: '库存', tabs: ['stocks'] },
  { key: 'configuration', label: '业务配置', tabs: ['suppliers', 'customers', 'employees', 'locationSettings', 'unitSettings', 'workCenters', 'processTemplates', 'processRoutes', 'businessSettings'] },
  { key: 'system', label: '系统设置', tabs: ['displaySettings', 'aiSettings'] },
  { key: 'tools', label: '工具', tabs: ['sawingCost', 'scanPrint', 'archive', 'auditLogs', 'dataTools'] },
]

interface WorkspaceFunctionDefinition extends WorkspaceFunctionItem {
  tab: TabType
  materialSection?: MaterialSection
  resource: string
  extraResource?: string
}

const workspaceFunctionCatalog: WorkspaceFunctionDefinition[] = [
  { key: 'dashboard', label: '仪表盘', groupKey: 'workspace', groupLabel: '工作台', description: '查看业务、生产和库存总览', icon: '仪', tab: 'dashboard', resource: 'dashboard' },
  { key: 'materialManagement', label: '物料管理', groupKey: 'materials', groupLabel: '物料', description: '维护物料、单位、规格和库存基础', icon: '料', tab: 'materials', materialSection: 'materials', resource: 'materials' },
  { key: 'bomWorkspace', label: 'BOM 设置', groupKey: 'materials', groupLabel: '物料', description: '创建 BOM 或修改已有 BOM 的整批输入与输出', icon: '本', tab: 'materials', materialSection: 'bomWorkspace', resource: 'materials', extraResource: 'bomCost' },
  { key: 'bomUsage', label: 'BOM 全览', groupKey: 'materials', groupLabel: '物料', description: '查看与某个物料有关的全部产出和投入 BOM', icon: '查', tab: 'materials', materialSection: 'bomUsage', resource: 'bomCost' },
  { key: 'workInstructions', label: '产品文档', groupKey: 'documents', groupLabel: '文档', description: '管理图纸、PDF 和作业指导文档', icon: '书', tab: 'workInstructions', resource: 'workInstructions' },
  { key: 'equipment', label: '设备台账', groupKey: 'equipment', groupLabel: '设备', description: '维护设备、状态、工作中心归属和基础参数', icon: '机', tab: 'equipment', resource: 'equipment' },
  { key: 'orders', label: '生产订单', groupKey: 'production', groupLabel: '生产', description: '先保存生产计划，班后再登记实际产量', icon: '工', tab: 'orders', resource: 'orders' },
  { key: 'flowTransfers', label: '流程转移', groupKey: 'production', groupLabel: '生产', description: '同一物料在库位或流程节点之间转移', icon: '转', tab: 'flowTransfers', resource: 'stats' },
  { key: 'materialIn', label: '来料管理', groupKey: 'logistics', groupLabel: '物流', description: '登记供应商来料、实测和采购计价', icon: '入', tab: 'materialIn', resource: 'materialIn' },
  { key: 'salesOrders', label: '销售订单', groupKey: 'sales', groupLabel: '销售', description: '登记客户需求并跟踪订单发货进度', icon: '销', tab: 'salesOrders', resource: 'salesOrder' },
  { key: 'shipment', label: '发货管理', groupKey: 'sales', groupLabel: '销售', description: '从已确认销售订单生成发货单并扣减库存', icon: '发', tab: 'shipment', resource: 'shipment' },
  { key: 'return', label: '退货管理', groupKey: 'sales', groupLabel: '销售', description: '登记退货、审核并处理返库', icon: '退', tab: 'return', resource: 'return' },
  { key: 'stocks', label: '库存管理', groupKey: 'inventory', groupLabel: '库存', description: '查看库存、库位余额和成本', icon: '库', tab: 'stocks', resource: 'stocks' },
  { key: 'suppliers', label: '供应商资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护供应商基础资料', icon: '供', tab: 'suppliers', resource: 'system' },
  { key: 'customers', label: '客户资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护客户基础资料', icon: '客', tab: 'customers', resource: 'system' },
  { key: 'employees', label: '员工资料', groupKey: 'configuration', groupLabel: '业务配置', description: '维护业务员工并供生产和转移单据选用', icon: '员', tab: 'employees', resource: 'system' },
  { key: 'locationSettings', label: '库位配置', groupKey: 'configuration', groupLabel: '业务配置', description: '配置库位、用途和默认库位', icon: '位', tab: 'locationSettings', resource: 'system' },
  { key: 'unitSettings', label: '单位配置', groupKey: 'configuration', groupLabel: '业务配置', description: '配置计量单位和同量纲换算', icon: '单', tab: 'unitSettings', resource: 'system' },
  { key: 'workCenters', label: '工作中心', groupKey: 'configuration', groupLabel: '业务配置', description: '配置锯切、钻孔、检验等生产能力区域', icon: '中', tab: 'workCenters', resource: 'system' },
  { key: 'processTemplates', label: '加工工艺', groupKey: 'configuration', groupLabel: '业务配置', description: '维护加工工艺模板和成本参数', icon: '艺', tab: 'processTemplates', resource: 'system' },
  { key: 'processRoutes', label: '物料路线', groupKey: 'configuration', groupLabel: '业务配置', description: '维护产品加工路线和工步', icon: '线', tab: 'processRoutes', resource: 'system' },
  { key: 'businessSettings', label: '企业与业务规则', groupKey: 'configuration', groupLabel: '业务配置', description: '维护企业资料和跨终端业务规则', icon: '业', tab: 'businessSettings', resource: 'system' },
  { key: 'displaySettings', label: '显示设置', groupKey: 'system', groupLabel: '系统设置', description: '维护配色、对比度和界面显示效果', icon: '显', tab: 'displaySettings', resource: 'system' },
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

const systemSectionByTab: Partial<Record<TabType, SystemSection>> = {
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
  aiSettings: 'aiSettings',
}

const lightweightHiddenResources = new Set<string>([
  'dispatch',
])

// ==================== 菜单图标组件 ====================

function MenuIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    dashboard: '仪',
    allFunctions: '全',
    orders: '工',
    materials: '料',
    workInstructions: '书',
    equipment: '机',
    materialIn: '入',
    dispatch: '派',
    stocks: '库',
    salesOrders: '销',
    shipment: '发',
    return: '退',
    stats: '报',
    flowTransfers: '转',
    sawingCost: '锯',
    scanPrint: '扫',
    suppliers: '供',
    customers: '客',
    employees: '员',
    processTemplates: '艺',
    processRoutes: '线',
    archive: '档',
    auditLogs: '记',
    dataTools: '数',
    unitSettings: '单',
    locationSettings: '位',
    workCenters: '中',
    businessSettings: '业',
    displaySettings: '显',
    aiSettings: '智',
    operators: '人',
    permissionUsers: '权',
    permissionGroups: '组',
    permissions: '限',
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
      {icons[icon] || '单'}
    </span>
  )
}

function compactNavLabel(label: string) {
  return label
    .replace('管理', '')
    .replace('统计分析', '统计')
    .replace('仪表盘', '仪表')
}

function displayMaterialCode(code?: string | null) {
  return code?.startsWith('MAT-') ? code.slice(4) : code || ''
}

// ==================== 状态映射 ====================

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PICKED: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-orange-100 text-orange-700',
  QC_WAITING: 'bg-purple-100 text-purple-700',
  QC_DONE: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PICKED: '已领料',
  RUNNING: '生产中',
  QC_WAITING: '待质检',
  QC_DONE: '质检完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

const orderStatusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'PICKED', label: '已领料' },
  { value: 'RUNNING', label: '生产中' },
  { value: 'QC_WAITING', label: '待质检' },
  { value: 'QC_DONE', label: '质检完成' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'
const desktopSidebarStorageKey = 'mes-lite.layout.desktopSidebarWidth'
const desktopSplitSidebarStorageKey = 'mes-lite.layout.desktopSplitSidebarWidth'
const desktopNavigationModeStorageKey = 'mes-lite.layout.desktopNavigationMode'
const desktopNavigationDisplayModeStorageKey = 'mes-lite.layout.desktopNavigationDisplayMode'
const defaultDesktopSidebarWidth = 224
const minDesktopSidebarWidth = 184
const maxDesktopSidebarWidth = 320
const defaultDesktopSplitSidebarWidth = 296
const minDesktopSplitSidebarWidth = 264
const maxDesktopSplitSidebarWidth = 384

function SystemMenu({
  containerRef,
  operator,
  items,
  activeTab,
  open,
  onToggle,
  onNavigate,
  onLogout,
  compact = false,
}: {
  containerRef: RefObject<HTMLDivElement>
  operator: CurrentOperator
  items: Array<{ key: TabType; label: string }>
  activeTab: TabType
  open: boolean
  onToggle: () => void
  onNavigate: (tab: TabType) => void
  onLogout: () => void
  compact?: boolean
}) {
  return (
    <div ref={containerRef} className={compact ? 'static shrink-0' : 'relative shrink-0'}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex items-center rounded-lg border border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50 ${
          compact ? 'gap-1 px-2 py-1.5 text-xs' : 'gap-2 px-3 py-2 text-sm'
        }`}
      >
        <span className={compact ? '' : 'max-w-32 truncate'}>{compact ? '我' : operator.name}</span>
        <span aria-hidden="true" className="text-gray-400">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-lg ${
            compact
              ? 'inset-x-3 sm:left-auto sm:right-4 sm:w-64'
              : 'right-0 w-64'
          }`}
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <OperatorBadge operator={operator} />
            <div className="mt-1 text-xs font-medium text-gray-400">MES-lite v{appVersion}</div>
          </div>
          <div className="p-2">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => onNavigate(item.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                  activeTab === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MenuIcon icon={item.key} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 主组件 ====================

export default function Home() {
  return (
    <AuthGate>
      {(operator, onLogout) => <HomeApp operator={operator} onLogout={onLogout} />}
    </AuthGate>
  )
}

function HomeApp({ operator, onLogout }: { operator: CurrentOperator; onLogout: () => void }) {
  const hasAnyGrant = Object.values(operator.permissions || {}).some((permission) => permission.canGrant)
  const canRead = (resource: string) =>
    operator.role === 'ADMIN' ||
    Boolean(operator.permissions?.[resource]?.canRead) ||
    ((resource === 'permissionUsers' || resource === 'permissionGroups') && hasAnyGrant)
  const canCreate = (resource: string) => operator.role === 'ADMIN' || Boolean(operator.permissions?.[resource]?.canCreate)
  const canUpdate = (resource: string) => operator.role === 'ADMIN' || Boolean(operator.permissions?.[resource]?.canUpdate)
  const baseNavItems: { key: TabType; label: string; resource: string }[] = [
    { key: 'dashboard', label: '仪表盘', resource: 'dashboard' },
    { key: 'materials', label: '物料与 BOM', resource: 'materials' },
    { key: 'workInstructions', label: '产品文档', resource: 'workInstructions' },
    { key: 'equipment', label: '设备台账', resource: 'equipment' },
    { key: 'materialIn', label: '来料管理', resource: 'materialIn' },
    { key: 'orders', label: '生产订单', resource: 'orders' },
    { key: 'dispatch', label: '派工管理', resource: 'dispatch' },
    { key: 'salesOrders', label: '销售订单', resource: 'salesOrder' },
    { key: 'shipment', label: '发货管理', resource: 'shipment' },
    { key: 'return', label: '退货管理', resource: 'return' },
    { key: 'stocks', label: '库存管理', resource: 'stocks' },
    { key: 'flowTransfers', label: '流程转移', resource: 'stats' },
    { key: 'suppliers', label: '供应商资料', resource: 'system' },
    { key: 'customers', label: '客户资料', resource: 'system' },
    { key: 'employees', label: '员工资料', resource: 'system' },
    { key: 'locationSettings', label: '库位配置', resource: 'system' },
    { key: 'unitSettings', label: '单位配置', resource: 'system' },
    { key: 'workCenters', label: '工作中心', resource: 'system' },
    { key: 'processTemplates', label: '加工工艺', resource: 'system' },
    { key: 'processRoutes', label: '物料路线', resource: 'system' },
    { key: 'sawingCost', label: '锯切成本', resource: 'sawingCost' },
    { key: 'scanPrint', label: '硬件工具', resource: 'scanPrint' },
    { key: 'archive', label: '归档记录', resource: 'system' },
    { key: 'auditLogs', label: '操作记录', resource: 'system' },
    { key: 'dataTools', label: '数据工具', resource: 'system' },
    { key: 'businessSettings', label: '企业与业务规则', resource: 'system' },
    { key: 'displaySettings', label: '显示设置', resource: 'system' },
    { key: 'aiSettings', label: 'AI 服务', resource: 'system' },
    { key: 'allFunctions', label: '所有功能', resource: 'dashboard' },
    { key: 'operators', label: '人员管理', resource: 'operators' },
    { key: 'permissionUsers', label: '人员权限', resource: 'permissionUsers' },
    { key: 'permissionGroups', label: '组权限', resource: 'permissionGroups' },
  ]
  const hiddenResources = lightweightHiddenResources
  const accountMenuKeys = new Set<TabType>(['operators', 'permissionUsers', 'permissionGroups'])
  const canReadNavItem = (item: { key: TabType; resource: string }) => (
    item.key === 'materials'
      ? canRead('materials') || canRead('bomCost')
      : canRead(item.resource)
  )
  const readableBusinessNavItems = baseNavItems.filter((item) => canReadNavItem(item) && !accountMenuKeys.has(item.key) && !hiddenResources.has(item.resource))
  const readableSystemNavItems = baseNavItems.filter((item) => canRead(item.resource) && accountMenuKeys.has(item.key) && !hiddenResources.has(item.resource))
  const pageContinuityStorageKey = `mes-lite.page-continuity.${operator.id}`
  const restoredPageContinuity = useMemo(
    () => readPageContinuity(pageContinuityStorageKey),
    [pageContinuityStorageKey],
  )
  const fallbackInitialTab = readableBusinessNavItems.find((item) => item.key === 'dashboard')?.key
    ?? readableBusinessNavItems[0]?.key
    ?? readableSystemNavItems[0]?.key
    ?? 'dashboard'
  const restoredTabAllowed = [...readableBusinessNavItems, ...readableSystemNavItems]
    .some((item) => item.key === restoredPageContinuity.tab)
  const initialTab = restoredTabAllowed ? restoredPageContinuity.tab as TabType : fallbackInitialTab
  const defaultMaterialSection: MaterialSection = canRead('materials') ? 'materials' : 'bomUsage'
  const restoredMaterialSection = restoredPageContinuity.materialSection
  const restoredMaterialSectionAllowed = restoredMaterialSection === 'materials'
    ? canRead('materials')
    : restoredMaterialSection === 'bomWorkspace'
      ? canRead('materials') && canRead('bomCost')
      : restoredMaterialSection === 'bomUsage'
        ? canRead('bomCost')
        : false
  const [tab, setTab] = useState<TabType>(initialTab)
  const [materialSection, setMaterialSection] = useState<MaterialSection>(
    restoredMaterialSectionAllowed ? restoredMaterialSection as MaterialSection : defaultMaterialSection,
  )
  const [bomEditorTarget, setBomEditorTarget] = useState<BomEditorTarget | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orderMaterialOptions, setOrderMaterialOptions] = useState<OrderMaterialOption[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [workspacePreference, setWorkspacePreference] = useState<WorkspacePreferenceValue>(defaultWorkspacePreference)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [planQty, setPlanQty] = useState(100)
  const [orderVoucherNo, setOrderVoucherNo] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedOrderBomId, setSelectedOrderBomId] = useState('')
  const [orderDraftLines, setOrderDraftLines] = useState<OrderDraftLine[]>([])
  const [orderKeyword, setOrderKeyword] = useState('')
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState(orderStatusOptions.map((option) => option.value))
  const [orderViewMode, setOrderViewMode] = usePersistedViewMode('mes-lite.orders.viewMode', 'card')
  const [stockKeyword, setStockKeyword] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockViewMode, setStockViewMode] = usePersistedViewMode('mes-lite.stocks.viewMode', 'card')
  const [stockCustomerFilter, setStockCustomerFilter] = useState('')
  const [stockLocationFilter, setStockLocationFilter] = useState('')
  const [selectedStockId, setSelectedStockId] = useState('')
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocationOption[]>([])
  const [selectedStockCategories, setSelectedStockCategories] = useState<string[]>(materialCategoryFilterOptions.map((option) => option.value))
  const [showInvalidStocks, setShowInvalidStocks] = useState(false)
  const [showStockHelp, setShowStockHelp] = useState(false)
  const [stockDataError, setStockDataError] = useState<{ message: string; issues: StockIntegrityIssue[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [desktopNavigationMode, setDesktopNavigationMode] = useState<DesktopNavigationMode>('accordion')
  const [desktopNavigationDisplayMode, setDesktopNavigationDisplayMode] = useState<DesktopNavigationDisplayMode>('icon-label')
  const [desktopSidebarWidth, setDesktopSidebarWidth] = useState(defaultDesktopSidebarWidth)
  const [desktopSplitSidebarWidth, setDesktopSplitSidebarWidth] = useState(defaultDesktopSplitSidebarWidth)
  const [desktopSidebarReady, setDesktopSidebarReady] = useState(false)
  const [wideDesktopNavigation, setWideDesktopNavigation] = useState(false)
  const [resizingDesktopSidebar, setResizingDesktopSidebar] = useState<DesktopNavigationMode | null>(null)
  const [pageUrlReady, setPageUrlReady] = useState(false)
  const systemMenuRef = useRef<HTMLDivElement>(null)
  const desktopSystemMenuRef = useRef<HTMLDivElement>(null)
  const pageContentRef = useRef<HTMLDivElement>(null)
  const pageUrlInitializedRef = useRef(false)
  const navOrderLoadedRef = useRef(false)
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState({
    locationId: '',
    newLocationQty: 0,
    newValuationQty: 0,
    newTotalCost: 0,
    reason: '',
  })
  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>(readableBusinessNavItems)
  const materialSectionItems = [
    { key: 'materials' as const, label: '物料管理', visible: canRead('materials') },
    { key: 'bomWorkspace' as const, label: 'BOM 设置', visible: canRead('materials') && canRead('bomCost') },
    { key: 'bomUsage' as const, label: 'BOM 全览', visible: canRead('bomCost') },
  ].filter((item) => item.visible)
  const workspaceFunctionItems = workspaceFunctionCatalog.filter((item) => (
    canRead(item.resource) && (!item.extraResource || canRead(item.extraResource))
  ))
  const tabLabels: Record<string, string> = Object.fromEntries(baseNavItems.map((item) => [item.key, item.label]))
  tabLabels.create = '创建生产订单'
  tabLabels.detail = '生产订单详情'
  const activeTabLabel = tab === 'materials'
    ? materialSectionItems.find((item) => item.key === materialSection)?.label || '物料与 BOM'
    : tabLabels[tab] || 'MES-lite'
  const activeSystemSection = systemSectionByTab[tab]
  const activePageModule = getPageModuleDefinition(resolvePageModuleKey(tab, materialSection))
  const activeSystemTab = readableSystemNavItems.some((item) => item.key === tab)
  const activeBusinessGroupKey: BusinessNavGroupKey = tab === 'create' || tab === 'detail'
    ? 'production'
    : businessNavGroups.find((group) => group.tabs.includes(tab))?.key || 'workspace'
  const visibleBusinessGroups = businessNavGroups
    .map((group) => ({
      ...group,
      items: navItems.filter((item) => group.tabs.includes(item.key)),
    }))
    .filter((group) => group.items.length > 0)
  const baseMobileNavItems = navItems.slice(0, 4)
  const mobilePrimaryItems = baseMobileNavItems
  const pageLocationKey = tab === 'materials' ? `${tab}:${materialSection}` : tab
  const activeGroupLabel = activeSystemTab
    ? '账号与权限'
    : businessNavGroups.find((group) => group.key === activeBusinessGroupKey)?.label || 'MES-lite'
  const activeFunctionPath = `${activeGroupLabel} / ${activeTabLabel}`
  const activeStateSummary = tab === 'orders'
    ? `视图：${orderViewMode === 'card' ? '卡片' : '列表'} · 状态筛选：${selectedOrderStatuses.length} 项`
    : tab === 'stocks'
      ? `视图：${stockViewMode === 'card' ? '卡片' : '列表'} · 类型：${stockFilter}`
      : tab === 'materials'
        ? `子页面：${activeTabLabel}`
        : `页面：${activeTabLabel}`
  const selectedOrderMaterial = orderMaterialOptions.find((material) => material.id === selectedMaterialId) || null
  const selectedOrderBoms = useMemo(() => selectedOrderMaterial?.boms || [], [selectedOrderMaterial])

  useEffect(() => {
    if (selectedOrderBoms.some((bom) => bom.id === selectedOrderBomId)) return
    const preferred = selectedOrderBoms.find((bom) => bom.isDefault) || selectedOrderBoms[0]
    setSelectedOrderBomId(preferred?.id || '')
  }, [selectedOrderBomId, selectedOrderBoms])

  useEffect(() => {
    if (pageUrlInitializedRef.current) return
    pageUrlInitializedRef.current = true
    const url = new URL(window.location.href)
    const requestedPage = url.searchParams.get('page') as TabType | null
    const allowedPages = [...readableBusinessNavItems, ...readableSystemNavItems]
    if (requestedPage && allowedPages.some((item) => item.key === requestedPage)) {
      setTab(requestedPage)
    }
    if (requestedPage === 'materials') {
      const requestedSection = url.searchParams.get('section') as MaterialSection | null
      if (requestedSection && materialSectionItems.some((item) => item.key === requestedSection)) {
        setMaterialSection(requestedSection)
      }
    }
    const requestedView = url.searchParams.get('view')
    if (requestedPage === 'orders' && (requestedView === 'card' || requestedView === 'list')) setOrderViewMode(requestedView)
    if (requestedPage === 'stocks' && (requestedView === 'card' || requestedView === 'list')) setStockViewMode(requestedView)
    const requestedQuery = url.searchParams.get('q') || ''
    if (requestedPage === 'orders') {
      setOrderKeyword(requestedQuery)
      const requestedStatuses = (url.searchParams.get('statuses') || '').split(',').filter((value) => orderStatusOptions.some((option) => option.value === value))
      if (requestedStatuses.length > 0) setSelectedOrderStatuses(requestedStatuses)
    }
    if (requestedPage === 'stocks') {
      setStockKeyword(requestedQuery)
      const requestedStockType = url.searchParams.get('stockType')
      if (requestedStockType === 'material' || requestedStockType === 'product') setStockFilter(requestedStockType)
      setStockCustomerFilter(url.searchParams.get('customer') || '')
      setStockLocationFilter(url.searchParams.get('location') || '')
      const requestedCategories = (url.searchParams.get('categories') || '').split(',').filter((value) => materialCategoryFilterOptions.some((option) => option.value === value))
      if (requestedCategories.length > 0) setSelectedStockCategories(requestedCategories)
      setShowInvalidStocks(url.searchParams.get('invalid') === '1')
      setSelectedStockId(url.searchParams.get('stock') || '')
    }
    setPageUrlReady(true)
  }, [materialSectionItems, readableBusinessNavItems, readableSystemNavItems, setOrderViewMode, setStockViewMode])

  useEffect(() => {
    if (!pageUrlReady) return
    const url = new URL(window.location.href)
    const shareablePage = tab === 'create' || tab === 'detail' ? 'orders' : tab
    url.searchParams.set('page', shareablePage)
    for (const key of ['section', 'view', 'q', 'statuses', 'stockType', 'customer', 'location', 'categories', 'invalid', 'stock']) {
      url.searchParams.delete(key)
    }
    if (shareablePage === 'materials') url.searchParams.set('section', materialSection)
    if (shareablePage === 'orders') {
      url.searchParams.set('view', orderViewMode)
      if (orderKeyword.trim()) url.searchParams.set('q', orderKeyword.trim())
      if (selectedOrderStatuses.length !== orderStatusOptions.length) url.searchParams.set('statuses', selectedOrderStatuses.join(','))
    }
    if (shareablePage === 'stocks') {
      url.searchParams.set('view', stockViewMode)
      if (stockKeyword.trim()) url.searchParams.set('q', stockKeyword.trim())
      if (stockFilter !== 'all') url.searchParams.set('stockType', stockFilter)
      if (stockCustomerFilter) url.searchParams.set('customer', stockCustomerFilter)
      if (stockLocationFilter) url.searchParams.set('location', stockLocationFilter)
      if (selectedStockCategories.length !== materialCategoryFilterOptions.length) url.searchParams.set('categories', selectedStockCategories.join(','))
      if (showInvalidStocks) url.searchParams.set('invalid', '1')
      if (selectedStockId) url.searchParams.set('stock', selectedStockId)
    }
    window.history.replaceState(window.history.state, '', url)
  }, [materialSection, orderKeyword, orderViewMode, pageUrlReady, selectedOrderStatuses, selectedStockCategories, selectedStockId, showInvalidStocks, stockCustomerFilter, stockFilter, stockKeyword, stockLocationFilter, stockViewMode, tab])

  useEffect(() => {
    const savedOrder = window.localStorage.getItem('mes-lite.nav.order')
    if (savedOrder) {
      try {
        const savedKeys = JSON.parse(savedOrder) as TabType[]
        const itemByKey = new Map(readableBusinessNavItems.map((item) => [item.key, item]))
        const ordered = savedKeys
          .map((key) => itemByKey.get(key))
          .filter(Boolean) as { key: TabType; label: string }[]
        const missing = readableBusinessNavItems.filter((item) => !savedKeys.includes(item.key))
        setNavItems([...ordered, ...missing])
      } catch (error) {
        setNavItems(readableBusinessNavItems)
      }
    } else {
      setNavItems(readableBusinessNavItems)
    }
    navOrderLoadedRef.current = true
  }, [])

  useEffect(() => {
    if (!navOrderLoadedRef.current) return
    window.localStorage.setItem('mes-lite.nav.order', JSON.stringify(navItems.map((item) => item.key)))
  }, [navItems])

  useEffect(() => {
    writePageContinuity(pageContinuityStorageKey, { tab, materialSection })
  }, [materialSection, pageContinuityStorageKey, tab])

  useEffect(() => {
    const content = pageContentRef.current
    if (!content) return

    const saved = readPageContinuity(pageContinuityStorageKey).scrollPositions?.[pageLocationKey]
    let restoring = false
    let userMoved = false
    let saveFrame = 0
    let latestCheckpoint = {
      contentTop: content.scrollTop,
      windowTop: window.scrollY,
    }

    const saveCheckpoint = () => {
      const current = readPageContinuity(pageContinuityStorageKey)
      writePageContinuity(pageContinuityStorageKey, {
        scrollPositions: {
          ...(current.scrollPositions || {}),
          [pageLocationKey]: latestCheckpoint,
        },
      })
    }
    const scheduleSave = () => {
      if (restoring) return
      latestCheckpoint = {
        contentTop: content.scrollTop,
        windowTop: window.scrollY,
      }
      if (saveFrame) return
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0
        saveCheckpoint()
      })
    }
    const saveBeforePageHide = () => {
      latestCheckpoint = {
        contentTop: content.scrollTop,
        windowTop: window.scrollY,
      }
      saveCheckpoint()
    }
    const markUserMoved = () => {
      if (!restoring) userMoved = true
    }
    const restoreCheckpoint = () => {
      if (!saved || userMoved) return
      restoring = true
      const contentTop = Number.isFinite(Number(saved.contentTop)) ? Math.max(0, Number(saved.contentTop)) : 0
      const windowTop = Number.isFinite(Number(saved.windowTop)) ? Math.max(0, Number(saved.windowTop)) : 0
      content.scrollTop = contentTop
      window.scrollTo({ top: windowTop, behavior: 'auto' })
      latestCheckpoint = { contentTop, windowTop }
      window.requestAnimationFrame(() => { restoring = false })
    }

    content.addEventListener('scroll', scheduleSave, { passive: true })
    content.addEventListener('wheel', markUserMoved, { passive: true })
    content.addEventListener('touchstart', markUserMoved, { passive: true })
    window.addEventListener('scroll', scheduleSave, { passive: true })
    window.addEventListener('wheel', markUserMoved, { passive: true })
    window.addEventListener('touchstart', markUserMoved, { passive: true })
    window.addEventListener('pagehide', saveBeforePageHide)

    const firstRestoreFrame = window.requestAnimationFrame(restoreCheckpoint)
    const delayedRestore = window.setTimeout(restoreCheckpoint, 500)
    return () => {
      if (saveFrame) saveCheckpoint()
      window.cancelAnimationFrame(firstRestoreFrame)
      if (saveFrame) window.cancelAnimationFrame(saveFrame)
      window.clearTimeout(delayedRestore)
      content.removeEventListener('scroll', scheduleSave)
      content.removeEventListener('wheel', markUserMoved)
      content.removeEventListener('touchstart', markUserMoved)
      window.removeEventListener('scroll', scheduleSave)
      window.removeEventListener('wheel', markUserMoved)
      window.removeEventListener('touchstart', markUserMoved)
      window.removeEventListener('pagehide', saveBeforePageHide)
    }
  }, [pageContinuityStorageKey, pageLocationKey])

  useEffect(() => {
    if (!systemMenuOpen) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (systemMenuRef.current?.contains(target) || desktopSystemMenuRef.current?.contains(target)) return
      setSystemMenuOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSystemMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [systemMenuOpen])

  useEffect(() => {
    if (!systemMenuOpen) return
    if (window.matchMedia('(min-width: 1024px)').matches) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [systemMenuOpen])

  useEffect(() => {
    if (!mobileNavOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavOpen])

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(desktopSidebarStorageKey))
    const savedSplitWidth = Number(window.localStorage.getItem(desktopSplitSidebarStorageKey))
    const syncNavigationPreference = () => {
      const savedNavigation = readDesktopNavigationPreference()
      setDesktopNavigationMode(savedNavigation.mode)
      setDesktopNavigationDisplayMode(savedNavigation.displayMode)
    }
    if (
      Number.isFinite(savedWidth)
      && savedWidth >= minDesktopSidebarWidth
      && savedWidth <= maxDesktopSidebarWidth
    ) {
      setDesktopSidebarWidth(savedWidth)
    }
    if (
      Number.isFinite(savedSplitWidth)
      && savedSplitWidth >= minDesktopSplitSidebarWidth
      && savedSplitWidth <= maxDesktopSplitSidebarWidth
    ) {
      setDesktopSplitSidebarWidth(savedSplitWidth)
    }
    syncNavigationPreference()
    window.addEventListener(preferenceChangeEvent, syncNavigationPreference)
    setDesktopSidebarReady(true)
    return () => window.removeEventListener(preferenceChangeEvent, syncNavigationPreference)
  }, [])

  useEffect(() => {
    if (!desktopSidebarReady) return
    window.localStorage.setItem(desktopSidebarStorageKey, String(desktopSidebarWidth))
    window.localStorage.setItem(desktopSplitSidebarStorageKey, String(desktopSplitSidebarWidth))
    window.localStorage.setItem(desktopNavigationModeStorageKey, desktopNavigationMode)
    window.localStorage.setItem(desktopNavigationDisplayModeStorageKey, desktopNavigationDisplayMode)
  }, [desktopNavigationDisplayMode, desktopNavigationMode, desktopSidebarReady, desktopSidebarWidth, desktopSplitSidebarWidth])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)')
    const sync = () => setWideDesktopNavigation(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!resizingDesktopSidebar) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const resize = (event: PointerEvent) => {
      if (resizingDesktopSidebar === 'split') {
        setDesktopSplitSidebarWidth(Math.min(
          maxDesktopSplitSidebarWidth,
          Math.max(minDesktopSplitSidebarWidth, event.clientX),
        ))
        return
      }
      setDesktopSidebarWidth(Math.min(
        maxDesktopSidebarWidth,
        Math.max(minDesktopSidebarWidth, event.clientX),
      ))
    }
    const stop = () => setResizingDesktopSidebar(null)

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
    }
  }, [resizingDesktopSidebar])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null)
      setDraggedIndex(null)
      return
    }

    const newItems = [...navItems]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(dropIndex, 0, draggedItem)
    setNavItems(newItems)
    setDragOverIndex(null)
    setDraggedIndex(null)
  }

  const moveNavItem = (key: TabType, direction: -1 | 1) => {
    setNavItems((current) => {
      const index = current.findIndex((item) => item.key === key)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const setMobileFavorite = (key: TabType) => {
    setNavItems((current) => {
      const index = current.findIndex((item) => item.key === key)
      if (index < 0 || index < 4) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(Math.min(3, next.length), 0, item)
      return next
    })
  }

  const showMessage = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 5000)
  }, [])

  const openBomEditor = useCallback((materialId: string, bomId?: string) => {
    setBomEditorTarget({ materialId, bomId, requestId: Date.now() })
    setMaterialSection('bomWorkspace')
    setTab('materials')
  }, [])

  const clearBomEditorTarget = useCallback(() => {
    setBomEditorTarget(null)
  }, [])

  const closeAiAssistant = useCallback(() => {
    setAiAssistantOpen(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/workspace-preferences')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload.data) return
        const data = payload.data
        setWorkspacePreference({
          mode: data.mode === 'SMART' || data.mode === 'CUSTOM' ? data.mode : 'DEFAULT',
          layout: Array.isArray(data.layout) ? data.layout.filter(isWorkspaceFunctionKey) : defaultWorkspacePreference.layout,
          pinned: Array.isArray(data.pinned) ? data.pinned.filter(isWorkspaceFunctionKey) : [],
          usage: Array.isArray(data.usage)
            ? data.usage.filter((item: { functionKey?: string }) => item.functionKey && isWorkspaceFunctionKey(item.functionKey))
            : [],
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const saveWorkspacePreference = async (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => {
    const response = await fetch('/api/workspace-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    const payload = await response.json()
    if (!response.ok) {
      showMessage(payload.error || '保存工作台设置失败')
      throw new Error(payload.error || '保存工作台设置失败')
    }
    setWorkspacePreference((current) => ({ ...current, ...next }))
  }

  const recordWorkspaceUsage = (functionKey: WorkspaceFunctionKey) => {
    const usedAt = new Date().toISOString()
    setWorkspacePreference((current) => {
      const existing = current.usage.find((item) => item.functionKey === functionKey)
      const usage = existing
        ? current.usage.map((item) => item.functionKey === functionKey
          ? { ...item, useCount: item.useCount + 1, lastUsedAt: usedAt }
          : item)
        : [...current.usage, { functionKey, useCount: 1, lastUsedAt: usedAt }]
      return { ...current, usage }
    })
    void fetch('/api/workspace-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionKey }),
    }).catch(() => undefined)
  }

  const openWorkspaceFunction = (functionKey: WorkspaceFunctionKey) => {
    const target = workspaceFunctionItems.find((item) => item.key === functionKey)
    if (!target) return
    if (target.materialSection) setMaterialSection(target.materialSection)
    setTab(target.tab)
    setMobileNavOpen(false)
    setSystemMenuOpen(false)
    recordWorkspaceUsage(functionKey)
  }

  const navigateToTab = (nextTab: TabType, nextMaterialSection?: MaterialSection) => {
    if (nextTab === 'allFunctions') {
      setTab('allFunctions')
      setMobileNavOpen(false)
      setSystemMenuOpen(false)
      return
    }
    const target = nextTab === 'materials'
      ? workspaceFunctionItems.find((item) => item.materialSection === (nextMaterialSection || 'materials'))
      : workspaceFunctionItems.find((item) => item.tab === nextTab)
    if (target) {
      openWorkspaceFunction(target.key)
      return
    }
    setTab(nextTab)
    setMobileNavOpen(false)
    setSystemMenuOpen(false)
  }

  useEffect(() => {
    if (tab === 'dashboard') fetchDashboard()
    if (tab === 'orders') fetchOrders()
    if (tab === 'stocks') {
      fetchStocks()
      fetchCustomers()
      fetchInventoryLocations()
    }
    if (tab === 'create') {
      fetchMaterialOptions()
    }
  }, [tab, orderKeyword, selectedOrderStatuses, stockKeyword, selectedStockCategories, stockCustomerFilter, stockLocationFilter, showInvalidStocks])

  const fetchOrders = async () => {
    const params = new URLSearchParams(getStatusQuery(selectedOrderStatuses, orderStatusOptions))
    if (orderKeyword.trim()) params.set('keyword', orderKeyword.trim())
    const url = params.toString() ? `/api/orders?${params.toString()}` : '/api/orders'
    const res = await fetch(url)
    const data = await res.json()
    setOrders(data.data || [])
  }

  const fetchStocks = async (options: { skipAutoBackfill?: boolean } = {}) => {
    const params = new URLSearchParams()
    if (stockKeyword.trim()) params.set('keyword', stockKeyword.trim())
    if (stockCustomerFilter) params.set('customerId', stockCustomerFilter)
    if (stockLocationFilter) params.set('locationId', stockLocationFilter)
    const categoryQuery = getMultiSelectQuery('categories', selectedStockCategories, materialCategoryFilterOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    if (showInvalidStocks) params.set('includeInvalid', '1')
    const res = await fetch(`/api/stocks${params.toString() ? `?${params.toString()}` : ''}`)
    const data = await res.json()
    if (!res.ok) {
      const issues = Array.isArray(data.issues) ? data.issues : []
      if (res.status === 409 && !options.skipAutoBackfill && canUpdate('stocks') && canBackfillStockIssues(issues)) {
        const repaired = await repairStockRecords({ refetch: false, silent: true })
        if (repaired) {
          showMessage('库存余额已自动补齐')
          await fetchDashboard()
          await fetchStocks({ skipAutoBackfill: true })
          return
        }
      }
      setStocks([])
      setStockDataError({ message: data.error || '库存数据异常', issues })
      showMessage(data.error || '库存数据异常')
      return
    }
    setStockDataError(null)
    setStocks(data.data || [])
  }

  const repairStockRecords = async (options: { refetch?: boolean; silent?: boolean } = {}) => {
    setLoading(true)
    try {
      const res = await fetch('/api/stocks', { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        if (!options.silent) showMessage(data.message || '库存余额已补齐')
        if (options.refetch ?? true) {
          await fetchStocks({ skipAutoBackfill: true })
          await fetchDashboard()
        }
        setLoading(false)
        return true
      } else {
        if (!options.silent) showMessage(data.error || '补齐库存余额失败')
      }
    } catch (err) {
      if (!options.silent) showMessage('补齐库存余额失败')
    }
    setLoading(false)
    return false
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const fetchInventoryLocations = async () => {
    try {
      const res = await fetch('/api/inventory-locations')
      if (res.ok) {
        const data = await res.json()
        const locations = (data.data || []) as InventoryLocationOption[]
        setInventoryLocations(locations)
        return locations
      }
    } catch (err) {
      // 库位加载失败时由调整弹窗阻止提交并提示用户。
    }
    return [] as InventoryLocationOption[]
  }

  const handleStockCategoryChange = (next: string[]) => {
    setSelectedStockCategories(next)
    if (next.length !== materialCategoryFilterOptions.length) {
      setStockFilter('material')
    }
  }

  const openStockAdjust = async (stock: Stock, preferredLocationId?: string) => {
    const locations = inventoryLocations.length > 0 ? inventoryLocations : await fetchInventoryLocations()
    if (locations.length === 0) {
      showMessage('请先在“配置 → 库位配置”中建立启用库位')
      return
    }
    const location = locations.find((item) => item.id === preferredLocationId)
      || stock.locationBalances.find((balance) => (
      Number(balance.qty) > 0 && locations.some((item) => item.id === balance.locationId)
    ))?.location
      || locations.find((item) => item.isDefault)
      || locations[0]
    const locationBalance = stock.locationBalances.find((balance) => balance.locationId === location.id)
    setAdjustingStock(stock)
    setStockAdjustForm({
      locationId: location.id,
      newLocationQty: Number(locationBalance?.qty || 0),
      newValuationQty: Number(stock.valuationQty || 0),
      newTotalCost: Number(stock.totalCost || 0),
      reason: '',
    })
  }

  const submitStockAdjust = async () => {
    if (!adjustingStock) return
    if (!stockAdjustForm.locationId) {
      showMessage('请选择本次调整对应的库位')
      return
    }
    if (!stockAdjustForm.reason.trim()) {
      showMessage('请输入存货调整原因')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: adjustingStock.id,
          locationId: stockAdjustForm.locationId,
          newLocationQty: Number(stockAdjustForm.newLocationQty),
          newValuationQty: Number(stockAdjustForm.newValuationQty),
          newTotalCost: Number(stockAdjustForm.newTotalCost),
          reason: stockAdjustForm.reason.trim(),
          adjustedBy: operator.name || operator.username,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(data.message || '存货调整完成')
        setAdjustingStock(null)
        await fetchStocks()
        await fetchDashboard()
      } else {
        showMessage(data.error || '存货调整失败')
      }
    } catch (err) {
      showMessage('存货调整失败')
    }
    setLoading(false)
  }

  const fetchMaterialOptions = async () => {
    const res = await fetch('/api/orders/options')
    if (res.ok) {
      const data = await res.json()
      const options = (data.data || []) as OrderMaterialOption[]
      setOrderMaterialOptions(options)
    }
  }

  const fetchDashboard = async () => {
    const res = await fetch('/api/stats/dashboard')
    if (res.ok) {
      const data = await res.json()
      setDashboard(data.data)
    }
  }

  const fetchOrderDetail = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`)
    const data = await res.json()
    setOrderDetail(data.data)
  }

  const createOrder = async () => {
    let lines = [...orderDraftLines]
    if (selectedMaterialId) {
      if (!selectedOrderBomId || planQty <= 0) {
        showMessage('请为当前产品选择 BOM 方案并输入有效计划数量')
        return
      }
      if (lines.some((line) => line.targetId === selectedMaterialId)) {
        showMessage('当前产品已经在订单明细中')
        return
      }
      lines = [...lines, { id: 'current', targetId: selectedMaterialId, bomId: selectedOrderBomId, planQty }]
    }
    if (lines.length === 0) {
      showMessage('请至少添加一个产品')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(({ id: _id, ...line }) => line),
          voucherNo: orderVoucherNo || undefined,
          note: orderNote || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(data.count > 1 ? `生产订单已保存：${data.groupNo}，共 ${data.count} 个产品` : `生产订单已保存：${data.data.orderNo}`)
        setPlanQty(100)
        setOrderVoucherNo('')
        setOrderNote('')
        setSelectedMaterialId('')
        setSelectedOrderBomId('')
        setOrderDraftLines([])
        await fetchOrders()
        await fetchStocks()
        setTab('orders')
      } else {
        showMessage(data.error || '创建失败')
      }
    } catch (err) {
      showMessage('创建失败')
    }
    setLoading(false)
  }

  const addOrderDraftLine = () => {
    if (!selectedMaterialId || !selectedOrderBomId || planQty <= 0) {
      showMessage('请选择产品、BOM 方案并输入有效计划数量')
      return
    }
    if (orderDraftLines.some((line) => line.targetId === selectedMaterialId)) {
      showMessage('当前产品已经在订单明细中')
      return
    }
    setOrderDraftLines((current) => [...current, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      targetId: selectedMaterialId,
      bomId: selectedOrderBomId,
      planQty,
    }])
    setSelectedMaterialId('')
    setSelectedOrderBomId('')
    setPlanQty(100)
    showMessage('产品已加入订单，可继续添加')
  }

  const handleSelectOrder = (order: Order) => {
    fetchOrderDetail(order.id)
    setTab('detail')
  }

  const dashboardView = {
    todayOrderCount: dashboard?.todayOrderCount ?? dashboard?.todayOrders ?? 0,
    monthOrderCount: dashboard?.monthOrderCount ?? dashboard?.monthOrders ?? 0,
    todayProductionActualCount: dashboard?.todayProductionActualCount ?? 0,
    monthProductionActualCount: dashboard?.monthProductionActualCount ?? 0,
    todayProduction: dashboard?.todayProduction ?? 0,
    monthProduction: dashboard?.monthProduction ?? 0,
    pendingProductionActualCount: dashboard?.pendingProductionActualCount ?? 0,
    pendingMaterialInCount: dashboard?.pendingMaterialInCount ?? dashboard?.pendingMaterialIns ?? 0,
    pendingShipmentCount: dashboard?.pendingShipmentCount ?? dashboard?.pendingShipments ?? 0,
    pendingReturnCount: dashboard?.pendingReturnCount ?? dashboard?.pendingReturns ?? 0,
    lowStocks: dashboard?.lowStocks ?? dashboard?.alertStocks ?? [],
    statusDistribution: dashboard?.statusDistribution ?? dashboard?.orderStatusDist ?? [],
    productionActualStatusDistribution: dashboard?.productionActualStatusDistribution ?? [],
  }
  const dashboardNumberText = (value: number) => Number(value || 0).toFixed(3).replace(/\.?0+$/, '') || '0'
  const dashboardMetricItems = [
    { label: '今日生产订单', value: dashboardView.todayOrderCount, tone: 'blue', hint: `班后实绩 ${dashboardView.todayProductionActualCount}` },
    { label: '本月生产订单', value: dashboardView.monthOrderCount, tone: 'indigo', hint: `班后实绩 ${dashboardView.monthProductionActualCount}` },
    { label: '今日确认产量', value: dashboardView.todayProduction, tone: 'green', hint: `主产出 ${dashboardNumberText(dashboardView.todayProduction)}` },
    { label: '本月确认产量', value: dashboardView.monthProduction, tone: 'emerald', hint: `主产出 ${dashboardNumberText(dashboardView.monthProduction)}` },
    { label: '待收货', value: dashboardView.pendingMaterialInCount, tone: 'yellow', hint: '来料' },
    { label: '待发货', value: dashboardView.pendingShipmentCount, tone: 'orange', hint: '出库' },
    { label: '退货待处理', value: dashboardView.pendingReturnCount, tone: 'red', hint: '售后' },
    { label: '库存预警', value: dashboardView.lowStocks.length, tone: 'pink', hint: '低库存' },
  ]
  const dashboardWorkloadItems = [
    { label: '今日订单', value: dashboardView.todayOrderCount, tone: 'blue' },
    { label: '今日实绩', value: dashboardView.todayProductionActualCount, tone: 'indigo' },
    { label: '本月订单', value: dashboardView.monthOrderCount, tone: 'blue' },
    { label: '本月实绩', value: dashboardView.monthProductionActualCount, tone: 'indigo' },
    { label: '今日主产出', value: dashboardView.todayProduction, tone: 'green' },
    { label: '本月主产出', value: dashboardView.monthProduction, tone: 'emerald' },
  ]
  const dashboardPendingItems = [
    { label: '生产实绩待确认', value: dashboardView.pendingProductionActualCount, tone: 'indigo', hint: '班后实绩草稿' },
    { label: '待收货', value: dashboardView.pendingMaterialInCount, tone: 'yellow', hint: '原材料入库' },
    { label: '待发货', value: dashboardView.pendingShipmentCount, tone: 'orange', hint: '成品出库' },
    { label: '退货待处理', value: dashboardView.pendingReturnCount, tone: 'red', hint: '售后返库' },
    { label: '库存预警', value: dashboardView.lowStocks.length, tone: 'pink', hint: '低于阈值' },
  ]
  const visibleStocks = stocks.filter((stock) => (
    stockFilter === 'all' ? true : stockFilter === 'material' ? !!stock.material : !!stock.product
  ))
  const orderSort = useClientTableSort(orders, {
    orderNo: (order) => order.groupNo || order.orderNo,
    voucherNo: (order) => order.voucherNo,
    target: (order) => `${order.targetMaterial?.code || order.product.sku} ${order.targetMaterial?.name || order.product.name}`,
    planQty: (order) => order.planQty,
    completed: (order) => order.completeQty,
    status: (order) => statusLabels[order.status] || order.status,
    createdAt: (order) => new Date(order.createdAt),
  }, 'createdAt', 'desc')
  const orderCardGroups = Array.from(orderSort.sortedRows.reduce((groups, order) => {
    const key = order.groupNo || order.orderNo
    const current = groups.get(key) || []
    current.push(order)
    groups.set(key, current)
    return groups
  }, new Map<string, Order[]>())).map(([groupNo, lines]) => ({
    groupNo,
    lines: [...lines].sort((left, right) => Number(left.lineNo || 1) - Number(right.lineNo || 1)),
  }))
  const stockSort = useClientTableSort(visibleStocks, {
    object: (stock) => `${stock.material?.code || stock.product?.sku || ''} ${stock.material?.name || stock.product?.name || ''}`,
    customer: (stock) => stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定',
    type: (stock) => stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品',
    qty: (stock) => stock.qty,
    reservedQty: (stock) => stock.reservedQty,
    availableQty: (stock) => stock.availableQty,
    valuationQty: (stock) => stock.valuationQty,
    totalCost: (stock) => stock.totalCost,
  }, 'object', 'asc')
  const selectedStock = stockSort.sortedRows.find((stock) => stock.id === selectedStockId)
    || stockSort.sortedRows[0]
    || null
  const selectedStockLocations = selectedStock?.locationBalances.filter((balance) => (
    Math.abs(Number(balance.qty)) > 0.000001 || Math.abs(Number(balance.reservedQty)) > 0.000001
  )) || []
  const splitNavigationVisible = desktopNavigationMode === 'split' && wideDesktopNavigation

  const desktopNavigationGroups: DesktopNavigationGroup[] = visibleBusinessGroups.map((group) => {
    const firstItem = group.tabs.map((key) => group.items.find((item) => item.key === key)).find(Boolean)
    const groupActive = !activeSystemTab && group.key === activeBusinessGroupKey
    const items = group.key === 'materials'
      ? materialSectionItems.map((section) => {
          const SectionIcon = section.key === 'materials' ? Boxes : section.key === 'bomWorkspace' ? PencilLine : Search
          return {
            id: `materials:${section.key}`,
            label: section.label,
            active: tab === 'materials' && materialSection === section.key,
            icon: <SectionIcon aria-hidden="true" className="h-4 w-4 shrink-0" />,
            onClick: () => navigateToTab('materials', section.key),
          }
        })
      : group.items.map((item) => {
          const index = navItems.findIndex((navItem) => navItem.key === item.key)
          return {
            id: item.key,
            label: item.label,
            active: tab === item.key || (item.key === 'orders' && (tab === 'create' || tab === 'detail')),
            draggable: true,
            dragState: draggedIndex === index ? 'dragging' as const : dragOverIndex === index ? 'target' as const : 'idle' as const,
            onDragStart: (event: React.DragEvent<HTMLButtonElement>) => handleDragStart(event, index),
            onDragOver: (event: React.DragEvent<HTMLButtonElement>) => handleDragOver(event, index),
            onDragLeave: handleDragLeave,
            onDrop: (event: React.DragEvent<HTMLButtonElement>) => handleDrop(event, index),
            onClick: () => navigateToTab(item.key),
          }
        })

    return {
      id: group.key,
      label: group.label,
      icon: <MenuIcon icon={firstItem?.key || group.key} />,
      active: groupActive,
      items,
      onClick: () => {
        if (firstItem) navigateToTab(firstItem.key)
      },
    }
  })

  if (readableSystemNavItems.length > 0) {
    desktopNavigationGroups.push({
      id: 'account',
      label: '账号与权限',
      icon: <MenuIcon icon="operators" />,
      active: activeSystemTab,
      items: readableSystemNavItems.map((item) => ({
        id: item.key,
        label: item.label,
        active: tab === item.key,
        onClick: () => navigateToTab(item.key),
      })),
      onClick: () => navigateToTab(readableSystemNavItems[0].key),
    })
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-gray-50"
      data-desktop-navigation={desktopNavigationMode}
      style={{
        '--mes-desktop-sidebar-width': `${desktopSidebarWidth}px`,
        '--mes-desktop-split-sidebar-width': `${desktopSplitSidebarWidth}px`,
      } as CSSProperties}
    >
      <InterfacePreferenceSync />
      <header className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center border-b border-gray-200 bg-white lg:flex">
        <div className={`flex h-full w-[var(--mes-desktop-sidebar-width)] shrink-0 items-center gap-3 border-r border-gray-200 px-4 ${
          desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''
        }`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold text-white">M</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-gray-800">MES-lite</h1>
            <p className="truncate text-[11px] text-gray-500">生产系统 · v{appVersion}</p>
          </div>
        </div>
        <div
          id="topbar-actions-desktop"
          aria-label="页面搜索、筛选和工具"
          className="flex min-w-0 flex-1 items-center gap-3 overflow-visible px-4 empty:before:content-['']"
        />
        <div className="flex h-full shrink-0 items-center gap-2 border-l border-gray-100 px-4">
          {canRead('aiAssistant') && (
            <button
              type="button"
              onClick={() => {
                setAiAssistantOpen(true)
                setSystemMenuOpen(false)
              }}
              aria-label="打开 AI 协作助手"
              aria-describedby="ai-assistant-trigger-tooltip"
              className="mes-ai-assistant-trigger group relative flex h-12 w-12 items-center justify-center rounded-full bg-transparent p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <AiAssistantMark animated priority className="h-11 w-11" />
              <span
                id="ai-assistant-trigger-tooltip"
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-[70] mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                打开 AI 助手
              </span>
            </button>
          )}
          <PageQrCodeButton
            pageTitle={activeTabLabel}
            functionPath={activeFunctionPath}
            stateSummary={activeStateSummary}
            compact
          />
          <SystemMenu
            containerRef={desktopSystemMenuRef}
            operator={operator}
            items={readableSystemNavItems}
            activeTab={tab}
            open={systemMenuOpen}
            onToggle={() => setSystemMenuOpen((open) => !open)}
            onNavigate={(nextTab) => {
              navigateToTab(nextTab)
            }}
            onLogout={() => {
              setSystemMenuOpen(false)
              onLogout()
            }}
          />
        </div>
      </header>

      <aside className={`fixed bottom-0 left-0 top-16 z-30 hidden w-[var(--mes-desktop-sidebar-width)] flex-col border-r border-gray-200 bg-white lg:flex ${
        desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''
      }`}>
        <DesktopNavigation mode={desktopNavigationMode} groups={desktopNavigationGroups} displayMode={desktopNavigationDisplayMode} />
        <div
          role="separator"
          aria-label="调整左侧辅助功能区宽度"
          aria-orientation="vertical"
          aria-valuemin={splitNavigationVisible ? minDesktopSplitSidebarWidth : minDesktopSidebarWidth}
          aria-valuemax={splitNavigationVisible ? maxDesktopSplitSidebarWidth : maxDesktopSidebarWidth}
          aria-valuenow={Math.round(splitNavigationVisible ? desktopSplitSidebarWidth : desktopSidebarWidth)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            setResizingDesktopSidebar(splitNavigationVisible ? 'split' : 'accordion')
          }}
          onDoubleClick={() => {
            if (splitNavigationVisible) setDesktopSplitSidebarWidth(defaultDesktopSplitSidebarWidth)
            else setDesktopSidebarWidth(defaultDesktopSidebarWidth)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            if (splitNavigationVisible) {
              setDesktopSplitSidebarWidth((current) => Math.min(
                maxDesktopSplitSidebarWidth,
                Math.max(minDesktopSplitSidebarWidth, current + (event.key === 'ArrowRight' ? 8 : -8)),
              ))
              return
            }
            setDesktopSidebarWidth((current) => Math.min(
              maxDesktopSidebarWidth,
              Math.max(minDesktopSidebarWidth, current + (event.key === 'ArrowRight' ? 8 : -8)),
            ))
          }}
          className={`group absolute inset-y-0 right-0 flex w-3 translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none ${
            resizingDesktopSidebar ? 'bg-blue-50/70' : ''
          }`}
          title="拖动调整左侧宽度，双击恢复默认"
        >
          <span className={`h-20 w-1 rounded-full transition ${
            resizingDesktopSidebar
              ? 'bg-blue-500'
              : 'bg-gray-300 group-hover:bg-blue-400 group-focus:bg-blue-500'
          }`} />
        </div>
      </aside>

      <main className={`mes-mobile-main min-w-0 p-3 sm:p-4 lg:ml-[var(--mes-desktop-sidebar-width)] lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:p-6 lg:pb-0 lg:pt-20 ${
        desktopNavigationMode === 'split' ? 'xl:ml-[var(--mes-desktop-split-sidebar-width)]' : ''
      }`}>
        <div className={`sticky top-0 -mx-3 mb-3 shrink-0 border-b border-gray-200 bg-gray-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:mb-4 sm:px-4 lg:hidden ${
          systemMenuOpen ? 'z-[60] lg:z-30' : 'z-30'
        }`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <button
                type="button"
                aria-label="打开全部功能"
                aria-haspopup="dialog"
                aria-expanded={mobileNavOpen}
                onClick={() => {
                  setMobileNavOpen(true)
                  setSystemMenuOpen(false)
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
                {activeTabLabel}
              </div>
              <PageQrCodeButton
                pageTitle={activeTabLabel}
                functionPath={activeFunctionPath}
                stateSummary={activeStateSummary}
                compact
              />
              <SystemMenu
                containerRef={systemMenuRef}
                operator={operator}
                items={readableSystemNavItems}
                activeTab={tab}
                open={systemMenuOpen}
                onToggle={() => {
                  setSystemMenuOpen((open) => !open)
                  setMobileNavOpen(false)
                }}
                onNavigate={(nextTab) => {
                  navigateToTab(nextTab)
                }}
                onLogout={() => {
                  setSystemMenuOpen(false)
                  onLogout()
                }}
                compact
              />
            </div>
            <div id="topbar-actions-mobile" className="order-3 flex min-w-0 flex-[1_1_100%] items-center justify-start gap-2 overflow-visible empty:hidden" />
            <TopBarPortal>
                {tab === 'orders' ? (
                  <ResponsiveToolbarActions
                    pageKey="orders"
                    primaryFilters={(
                      <SearchFieldWithPresets
                        storageKey="mes-lite.searchPresets.orders"
                        value={orderKeyword}
                        onChange={setOrderKeyword}
                        placeholder="搜索生产订单号、凭据号或物料"
                      />
                    )}
                    filters={(
                      <StatusCheckboxFilter
                        options={orderStatusOptions}
                        value={selectedOrderStatuses}
                        onChange={setSelectedOrderStatuses}
                        storageKey="mes-lite.filters.orders.status.order"
                      />
                    )}
                    viewControl={<ViewModeToggle value={orderViewMode} onChange={setOrderViewMode} />}
                    actions={(
                      <>
                        {canCreate('orders') && (
                          <AppButton
                            variant="create"
                            onClick={() => setTab('create')}
                          >
                            新建生产订单
                          </AppButton>
                        )}
                      </>
                    )}
                  />
                ) : tab === 'stocks' ? (
                  <ResponsiveToolbarActions
                    pageKey="stocks"
                    primaryFilters={(
                      <SearchFieldWithPresets
                        storageKey="mes-lite.searchPresets.stocks"
                        value={stockKeyword}
                        onChange={setStockKeyword}
                        placeholder="搜索物料或编码"
                      />
                    )}
                    filters={(
                      <>
                        <SearchableSelect
                          value={stockCustomerFilter}
                          onChange={setStockCustomerFilter}
                          options={[
                            { value: '__UNASSIGNED__', label: '通用/未绑定' },
                            ...customers.map((customer) => ({ value: customer.id, label: customer.name, keywords: customer.code })),
                          ]}
                          placeholder="输入客户名称筛选（全部客户）"
                          allowClear
                          className="w-56"
                        />
                        <SearchableSelect
                          value={stockLocationFilter}
                          onChange={setStockLocationFilter}
                          options={inventoryLocations.map((location) => ({
                            value: location.id,
                            label: `${location.code} · ${location.name}`,
                          }))}
                          placeholder="输入库位编码或名称筛选"
                          allowClear
                          className="w-56"
                        />
                        {([['all', '全部库存'], ['material', '物料库存'], ['product', '成品库存']] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setStockFilter(key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                              stockFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                        <StatusCheckboxFilter
                          options={materialCategoryFilterOptions}
                          value={selectedStockCategories}
                          onChange={handleStockCategoryChange}
                          allLabel="全部物料分类"
                          storageKey="mes-lite.filters.stocks.category.order"
                        />
                        <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={showInvalidStocks}
                            onChange={(e) => setShowInvalidStocks(e.target.checked)}
                          />
                          显示归档无库存
                        </label>
                      </>
                    )}
                    viewControl={<ViewModeToggle value={stockViewMode} onChange={setStockViewMode} />}
                    actions={(
                      <>
                        <button
                          onClick={() => setShowStockHelp(true)}
                          className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-xs hover:bg-blue-50 sm:px-4 sm:py-2 sm:text-sm"
                        >
                          调整
                        </button>
                      </>
                    )}
                  />
                ) : tab === 'create' || tab === 'detail' ? (
                  <ResponsiveToolbarActions
                    pageKey={tab}
                    actions={<AppButton onClick={() => setTab('orders')}>返回生产订单</AppButton>}
                  />
                ) : ['dashboard', 'sawingCost', 'scanPrint', 'dataTools'].includes(activePageModule.key) ? (
                  <ResponsiveToolbarActions pageKey={activePageModule.key} />
                ) : null}
            </TopBarPortal>
          </div>
        </div>

        <div
          ref={pageContentRef}
          aria-label="页面内容区"
          className="mes-page-content-scroll min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-scroll lg:overscroll-contain lg:pb-6 lg:[scrollbar-gutter:stable]"
        >
        <PageModuleBoundary
          definition={activePageModule}
          toolbarProvided={tab === 'orders' || tab === 'stocks' || tab === 'create' || tab === 'detail' || ['dashboard', 'sawingCost', 'scanPrint', 'dataTools'].includes(activePageModule.key)}
        >
        {tab === 'materials' && materialSectionItems.length > 1 && (
          <nav
            aria-label="物料与 BOM 二级菜单"
            className="mb-4 flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 lg:hidden"
          >
            {materialSectionItems.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={materialSection === item.key ? 'page' : undefined}
                onClick={() => setMaterialSection(item.key)}
                className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  materialSection === item.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {message && (
          createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:left-auto sm:right-4 sm:top-20 sm:w-[min(32rem,calc(100vw-2rem))] sm:px-0">
              <div role="status" aria-live="polite" className={`w-full rounded-lg border p-4 text-sm shadow-xl ${
                message.includes('成功') || message.includes('完成') || message.includes('补齐')
                  ? 'border-green-200 bg-green-100 text-green-700'
                  : 'border-red-200 bg-red-100 text-red-700'
              }`}>
                {message}
              </div>
            </div>,
            document.body,
          )
        )}

        {/* 仪表盘 */}
        {tab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            <WorkspaceLauncher
              items={workspaceFunctionItems.filter((item) => item.key !== 'dashboard')}
              preference={workspacePreference}
              onOpen={openWorkspaceFunction}
              onOpenAllFunctions={() => navigateToTab('allFunctions')}
              onSave={saveWorkspacePreference}
            />
            <DashboardKpiGrid items={dashboardMetricItems} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <DashboardBarPanel title="生产负荷" items={dashboardWorkloadItems} />
              <DashboardSignalGrid
                title="待处理事项"
                items={dashboardPendingItems}
              />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ProductionStatusOverview
                orderItems={dashboardView.statusDistribution}
                actualItems={dashboardView.productionActualStatusDistribution}
              />
              <StockAlertList stocks={dashboardView.lowStocks} />
            </div>
          </div>
        )}

        {tab === 'dashboard' && !dashboard && (
          <AppLoadingIndicator label="正在加载仪表盘..." />
        )}

        {/* 所有功能 */}
        {tab === 'allFunctions' && (
          <AllFunctionsPage
            items={workspaceFunctionItems}
            preference={workspacePreference}
            onOpen={openWorkspaceFunction}
          />
        )}

        {/* 生产订单 */}
        {tab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-3 sm:p-6">
            {orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500 sm:py-12">
                <p className="mb-4">暂无生产订单</p>
                {canCreate('orders') && (
                  <AppButton
                    variant="create"
                    onClick={() => setTab('create')}
                  >
                    新建生产订单
                  </AppButton>
                )}
              </div>
            ) : orderViewMode === 'card' ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {orderCardGroups.map((group) => {
                  const first = group.lines[0]
                  return (
                  <div key={group.groupNo} className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold text-blue-700">{group.groupNo}</div>
                        <div className="mt-1 text-xs text-gray-500">凭据号：{first.voucherNo || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">{new Date(first.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{group.lines.length} 个产品</span>
                        <div onClick={(event) => event.stopPropagation()}>
                          <AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={first.id} compact onMessage={showMessage} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                      {group.lines.map((order) => (
                        <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{order.targetMaterial?.name || order.product.name}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {order.targetMaterial?.code || displayMaterialCode(order.product.sku)} · BOM {order.bom?.name || order.bomName || '-'} {order.bom?.version || order.bomVersion || ''}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">计划 {order.planQty} · 完成 {order.completeQty} · 报废 {order.scrapQty}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-2 py-1 text-xs font-medium ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                            <button onClick={() => handleSelectOrder(order)} className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">详情 / 登记实绩</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortableTableHeader column="orderNo" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>生产订单号</SortableTableHeader>
                      <SortableTableHeader column="voucherNo" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>凭据号</SortableTableHeader>
                      <SortableTableHeader column="target" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>目标</SortableTableHeader>
                      <SortableTableHeader column="planQty" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>计划</SortableTableHeader>
                      <SortableTableHeader column="completed" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>完成/报废</SortableTableHeader>
                      <SortableTableHeader column="status" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>状态</SortableTableHeader>
                      <SortableTableHeader column="createdAt" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>时间</SortableTableHeader>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderSort.sortedRows.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectOrder(order)}>
                        <td className="px-4 py-3 font-mono text-blue-600 text-sm">
                          {order.groupNo || order.orderNo}{order.groupNo ? <span className="ml-1 text-xs text-gray-400">第 {order.lineNo} 项</span> : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{order.voucherNo || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{order.targetMaterial?.name || order.product.name}</div>
                          <div className="text-xs text-gray-500">
                            物料 {order.targetMaterial?.code || displayMaterialCode(order.product.sku)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{order.planQty}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-green-600">{order.completeQty}</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-red-500">{order.scrapQty}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[order.status]}`}>
                            {statusLabels[order.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={order.id} compact onMessage={showMessage} />
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={(e) => { e.stopPropagation(); handleSelectOrder(order) }} className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">详情 / 登记实绩</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 生产订单详情 */}
        {tab === 'detail' && orderDetail && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">生产订单详情</h2>
                <p className="text-sm text-gray-500">{orderDetail.groupNo || orderDetail.orderNo}{orderDetail.groupNo ? ` · 第 ${orderDetail.lineNo} 项` : ''}</p>
                <p className="text-sm text-gray-500">凭据号：{orderDetail.voucherNo || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">目标</div>
                <div className="font-medium">{orderDetail.targetMaterial?.name || orderDetail.product.name}</div>
                <div className="text-xs text-gray-400">
                  物料 {orderDetail.targetMaterial?.code || displayMaterialCode(orderDetail.product.sku)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">BOM 方案</div>
                <div className="font-medium">{orderDetail.bomName || orderDetail.bom?.name || '-'}</div>
                <div className="text-xs text-gray-400">{orderDetail.bomVersion || orderDetail.bom?.version || '-'}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">状态</div>
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[orderDetail.status]}`}>{statusLabels[orderDetail.status]}</span>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">计划/完成</div>
                <div className="font-medium">{orderDetail.planQty} / {orderDetail.completeQty}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">报废</div>
                <div className="font-medium text-red-600">{orderDetail.scrapQty}</div>
              </div>
            </div>
            {orderDetail.groupLines?.length > 1 && (
              <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                <div className="mb-3 text-sm font-semibold text-gray-900">本订单产品</div>
                <div className="flex flex-wrap gap-2">
                  {orderDetail.groupLines.map((line: any) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => fetchOrderDetail(line.id)}
                      className={`rounded-md border px-3 py-2 text-left text-sm ${line.id === orderDetail.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'}`}
                    >
                      <span className="font-medium">{line.targetMaterial?.name || line.product.name}</span>
                      <span className={`ml-2 text-xs ${line.id === orderDetail.id ? 'text-blue-100' : 'text-gray-500'}`}>计划 {line.planQty}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ProductionOrderActualPanel
              orderId={orderDetail.id}
              onMessage={showMessage}
              onOrderChanged={async () => {
                await Promise.all([fetchOrderDetail(orderDetail.id), fetchOrders(), fetchDashboard()])
              }}
            />
            <div className="mt-6">
              <AttachmentPanel
                ownerType="PRODUCTION_ORDER"
                ownerId={orderDetail.id}
                title="生产订单原始单据"
                onMessage={showMessage}
              />
            </div>
          </div>
        )}

        {/* 创建生产订单 */}
        {tab === 'create' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-4xl">
            <h2 className="text-xl font-semibold mb-2">创建生产订单</h2>
            <p className="mb-6 text-sm text-gray-500">一张订单可加入多个产品；这里不指定库位，班后登记实际投入和产出时再选择对应库位。</p>
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-4 text-sm font-semibold text-gray-900">添加产品明细</div>
                <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">主产出物料</label>
                <SearchableSelect
                  value={selectedMaterialId}
                  onChange={setSelectedMaterialId}
                  options={orderMaterialOptions.map((material) => ({
                    value: material.id,
                    label: `${material.code} · ${material.name} · ${materialCategoryLabels[material.category] || material.category}`,
                  }))}
                  placeholder="输入可生产物料的编码、名称或分类筛选"
                />
                <p className="mt-1 text-xs text-gray-500">仅显示已有启用 BOM 的物料；BOM 投入可包含原材料、半成品或已有产品。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">BOM 方案</label>
                <SearchableSelect
                  value={selectedOrderBomId}
                  onChange={setSelectedOrderBomId}
                  options={selectedOrderBoms.map((bom) => ({
                    value: bom.id,
                    label: `${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''}`,
                  }))}
                  placeholder={selectedMaterialId ? '输入方案名称或版本筛选' : '请先选择主产出物料'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">计划产量</label>
                <input type="number" value={planQty} onChange={(e) => setPlanQty(Number(e.target.value))} min="0.000001" step="0.000001" className="w-full px-4 py-3 border border-gray-200 rounded-lg" />
              </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <AppButton variant="secondary" onClick={addOrderDraftLine}>添加产品</AppButton>
                </div>
              </div>
              {orderDraftLines.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">订单产品明细</div>
                    <div className="text-xs text-gray-500">已添加 {orderDraftLines.length} 项</div>
                  </div>
                  <div className="space-y-2">
                    {orderDraftLines.map((line, index) => {
                      const material = orderMaterialOptions.find((item) => item.id === line.targetId)
                      const bom = material?.boms.find((item) => item.id === line.bomId)
                      return (
                        <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="mr-2 text-xs text-gray-400">{index + 1}</span>
                            <span className="font-medium text-gray-900">{material?.code} · {material?.name}</span>
                            <span className="ml-2 text-xs text-gray-500">{bom?.name} {bom?.version} · 计划 {line.planQty}</span>
                          </div>
                          <button type="button" onClick={() => setOrderDraftLines((current) => current.filter((item) => item.id !== line.id))} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">移除</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
                <input
                  type="text"
                  value={orderVoucherNo}
                  onChange={(e) => setOrderVoucherNo(e.target.value)}
                  placeholder="客户订单号、生产指令号或纸质单号"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={orderNote}
                  onChange={(event) => setOrderNote(event.target.value)}
                  rows={3}
                  placeholder="交期、班次、客户要求或其它生产说明"
                  className="w-full rounded-lg border border-gray-200 px-4 py-3"
                />
              </div>
              <button onClick={createOrder} disabled={loading} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? '创建中...' : `保存生产订单${orderDraftLines.length > 0 ? `（${orderDraftLines.length + (selectedMaterialId ? 1 : 0)} 个产品）` : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* 库存管理 */}
        {tab === 'stocks' && (
          <div className="bg-white rounded-lg shadow p-3 sm:p-6">
            {stockDataError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="font-semibold">{stockDataError.message}</div>
                    <div className="mt-1 text-xs text-red-700">库存页已停止展示可能不完整的数据，请先处理以下一致性问题。</div>
                  </div>
                  {canUpdate('stocks') && canBackfillStockIssues(stockDataError.issues) && (
                    <button
                      type="button"
                      onClick={() => repairStockRecords()}
                      disabled={loading}
                      className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-fit"
                    >
                      {loading ? '修复中...' : '补齐库存余额'}
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {stockDataError.issues.map((issue, index) => (
                    <div key={`${issue.type || index}-${index}`} className="rounded border border-red-100 bg-white/70 p-2">
                      <div className="font-medium">{issue.message || issue.type}</div>
                      <div className="mt-1 space-y-1 text-xs text-red-700">
                        {(issue.records || []).length > 0 ? (issue.records || []).map((record: any) => (
                          <div key={record.id || record.code}>
                            <span className="font-medium">{record.code || record.id}</span>
                            {record.reasons?.length ? `：${record.reasons.join('；')}` : ''}
                          </div>
                        )) : '无明细'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">
            {stockViewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>
                      <SortableTableHeader column="object" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存对象</SortableTableHeader>
                      <SortableTableHeader column="customer" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>客户</SortableTableHeader>
                      <SortableTableHeader column="type" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>类型</SortableTableHeader>
                      <SortableTableHeader column="qty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存</SortableTableHeader>
                      <SortableTableHeader column="reservedQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>已预留</SortableTableHeader>
                      <SortableTableHeader column="availableQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>可用</SortableTableHeader>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库位</th>
                      <SortableTableHeader column="valuationQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>核算库存</SortableTableHeader>
                      <SortableTableHeader column="totalCost" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存金额</SortableTableHeader>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockSort.sortedRows.map((stock) => {
                      const occupiedLocations = stock.locationBalances.filter((balance) => Math.abs(Number(balance.qty)) > 0.000001)
                      const stockUnit = stock.material?.stockUnit || stock.product?.unit || ''
                      return (
                      <tr
                        key={stock.id}
                        onClick={() => setSelectedStockId(stock.id)}
                        className={`cursor-pointer transition ${selectedStock?.id === stock.id ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-3">
                          {stock.material?.primaryImage ? (
                            <a
                              href={stock.material.primaryImage.originalUrl || stock.material.primaryImage.url}
                              target="_blank"
                              rel="noreferrer"
                              title={stock.material.primaryImage.note || '查看物料图片'}
                              className="block h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={stock.material.primaryImage.thumbnailUrl || stock.material.primaryImage.url} alt={stock.material.primaryImage.note || stock.material.name} className="h-full w-full object-cover" />
                            </a>
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
                              无图
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{stock.material?.name || stock.product?.name}</div>
                          <div className="text-xs text-gray-500">{stock.material?.code || stock.product?.sku}</div>
                          {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品'}
                            </span>
                            {stock.material?.deletedAt && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">已归档</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>{stockQuantityText(stock.qty)} {stockUnit}</div>
                          {stock.packagingSummary && (
                            <div className="mt-1 text-xs font-medium text-emerald-700">
                              穿透 {stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {stockUnit}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-orange-600">{stock.reservedQty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className={`px-4 py-3 text-sm font-medium ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className="px-4 py-3 text-xs">
                          {occupiedLocations.length > 0 ? (
                            <div className="space-y-1">
                              {occupiedLocations.slice(0, 2).map((balance) => (
                                <div key={balance.id} className="flex max-w-44 justify-between gap-2 text-gray-600">
                                  <span className="truncate" title={`${balance.location.code} · ${balance.location.name}`}>{balance.location.code}</span>
                                  <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {stockUnit}</span>
                                </div>
                              ))}
                              {occupiedLocations.length > 2 && <div className="text-blue-600">另有 {occupiedLocations.length - 2} 个库位</div>}
                            </div>
                          ) : <span className="text-gray-400">无库位库存</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {stock.material ? `${stock.valuationQty} ${stock.material.valuationUnit}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {stock.material ? `¥${Number(stock.totalCost || 0).toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {canUpdate('stocks') && (
                            <button
                              onClick={() => openStockAdjust(stock)}
                              className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                            >
                              存货调整
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stockSort.sortedRows.map((stock) => {
                  const occupiedLocations = stock.locationBalances.filter((balance) => Math.abs(Number(balance.qty)) > 0.000001)
                  const stockUnit = stock.material?.stockUnit || stock.product?.unit || ''
                  return (
                  <div
                    key={stock.id}
                    onClick={() => setSelectedStockId(stock.id)}
                    className={`cursor-pointer border rounded-lg p-4 transition ${selectedStock?.id === stock.id ? 'border-blue-400 bg-blue-50/40 shadow-sm' : 'border-gray-200 hover:shadow-md'}`}
                  >
	                  <div className="flex items-start justify-between mb-3">
	                    <div className="flex min-w-0 items-start gap-3">
                        {stock.material?.primaryImage ? (
                          <a
                            href={stock.material.primaryImage.originalUrl || stock.material.primaryImage.url}
                            target="_blank"
                            rel="noreferrer"
                            title={stock.material.primaryImage.note || '查看物料图片'}
                            className="block h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={stock.material.primaryImage.thumbnailUrl || stock.material.primaryImage.url} alt={stock.material.primaryImage.note || stock.material.name} className="h-full w-full object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
                            无图
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-800">{stock.material?.name || stock.product?.name}</div>
                          <div className="text-sm text-gray-500">{stock.material?.code || stock.product?.sku}</div>
                          <div className="text-xs text-gray-400">
                            客户：{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}
                          </div>
                          {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                        </div>
	                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品'}
                      </div>
                      {stock.material?.deletedAt && (
                        <div className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          已归档
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">库存</div>
                      <div className="text-lg font-semibold">{stockQuantityText(stock.qty)}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">已预留</div>
                      <div className="text-lg font-semibold text-orange-600">{stock.reservedQty}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">可用</div>
                      <div className={`text-lg font-semibold ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">库位库存</span>
                      <span className="text-gray-400">{occupiedLocations.length} 个库位</span>
                    </div>
                    {occupiedLocations.length > 0 ? (
                      <div className="space-y-1.5">
                        {occupiedLocations.slice(0, 3).map((balance) => (
                          <div key={balance.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-gray-500" title={`${balance.location.code} · ${balance.location.name}`}>
                              {balance.location.code} · {balance.location.name}
                            </span>
                            <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {stockUnit}</span>
                          </div>
                        ))}
                        {occupiedLocations.length > 3 && <div className="text-xs text-blue-600">另有 {occupiedLocations.length - 3} 个库位，点击查看</div>}
                      </div>
                    ) : <div className="text-xs text-gray-400">当前没有库位库存</div>}
                  </div>
                  {stock.packagingSummary && (
                    <div className="mt-3 border-t border-emerald-100 pt-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-emerald-800">包装穿透合计</span>
                        <span className="font-semibold text-emerald-800">
                          {stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {stockUnit}
                        </span>
                      </div>
                      <div className="mt-1 text-gray-500">散装 {stockQuantityText(stock.qty)} + 包装等效 {stockQuantityText(stock.packagingSummary.packagedEquivalentQty)}</div>
                    </div>
                  )}
                  {stock.material && (
                    <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                      <div>核算库存：<span className="font-semibold text-gray-900">{stock.valuationQty}</span> {stock.material.valuationUnit}</div>
                      <div className="mt-1">库存金额：<span className="font-semibold text-gray-900">¥{Number(stock.totalCost || 0).toFixed(2)}</span></div>
                      <div className="mt-1">
                        成本：¥{Number(stock.valuationUnitCost || 0).toFixed(4)} / {stock.material.valuationUnit}
                        <span className="ml-2">¥{Number(stock.stockUnitCost || 0).toFixed(4)} / {stock.material.stockUnit || stock.material.unit}</span>
                      </div>
                      <div className="mt-1">
                        当前实际换算：1 {stock.material.stockUnit || stock.material.unit} = {Number(stock.qty) > 0 ? (Number(stock.valuationQty) / Number(stock.qty)).toFixed(6) : '-'} {stock.material.valuationUnit}
                      </div>
                      <div className="mt-1 text-gray-500">物料默认换算：1 {stock.material.stockUnit || stock.material.unit} = {stock.material.conversionRate || 1} {stock.material.valuationUnit}</div>
                    </div>
                  )}
                  {canUpdate('stocks') && (
                    <button
                      onClick={() => openStockAdjust(stock)}
                      className="mt-3 w-full px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50"
                    >
                      存货调整
                    </button>
                  )}
                </div>
              )})}
              </div>
            )}
            {visibleStocks.length === 0 && (
              <div className="py-12 text-center text-gray-500">暂无库存记录</div>
            )}
              </div>
              {selectedStock && (
                <aside className="min-w-0 border-t border-gray-200 pt-5 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{selectedStock.material?.name || selectedStock.product?.name}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">{selectedStock.material?.code || selectedStock.product?.sku}{selectedStock.material?.spec ? ` · ${selectedStock.material.spec}` : ''}</div>
                    </div>
                    {canUpdate('stocks') && (
                      <button
                        type="button"
                        onClick={() => openStockAdjust(selectedStock)}
                        className="shrink-0 rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        调整
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-3 text-center">
                    <div>
                      <div className="text-[11px] text-gray-500">总库存</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{stockQuantityText(selectedStock.qty)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">预留</div>
                      <div className="mt-1 text-sm font-semibold text-orange-600">{stockQuantityText(selectedStock.reservedQty)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">可用</div>
                      <div className="mt-1 text-sm font-semibold text-emerald-700">{stockQuantityText(selectedStock.availableQty)}</div>
                    </div>
                  </div>

                  <section className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">库位明细</h3>
                      <span className="text-xs text-gray-400">{selectedStockLocations.length} 个有库存库位</span>
                    </div>
                    {selectedStockLocations.length > 0 ? (
                      <div className="divide-y divide-gray-100 border-y border-gray-100">
                        {selectedStockLocations.map((balance) => (
                          <div key={balance.id} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-gray-800">{balance.location.code} · {balance.location.name}</div>
                                <div className="mt-1 text-[11px] text-gray-500">
                                  预留 {stockQuantityText(balance.reservedQty)} · 可用 {stockQuantityText(balance.availableQty)}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold text-gray-900">{stockQuantityText(balance.qty)} {selectedStock.material?.stockUnit || selectedStock.product?.unit}</div>
                                {canUpdate('stocks') && (
                                  <button
                                    type="button"
                                    onClick={() => openStockAdjust(selectedStock, balance.locationId)}
                                    className="mt-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    调整此库位
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-y border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">当前没有库位库存</div>
                    )}
                  </section>

                  {selectedStock.packagingDefinition && (
                    <section className="mt-5 border-t border-amber-100 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-amber-900">包装 BOM</h3>
                        <span className="text-xs text-amber-700">{selectedStock.packagingDefinition.bom.version}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{selectedStock.packagingDefinition.bom.name}</div>
                      <div className="mt-2 space-y-1.5">
                        {selectedStock.packagingDefinition.contents.map((content) => (
                          <div key={content.material.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-gray-600">{content.material.code} · {content.material.name}</span>
                            <span className="shrink-0 font-medium text-gray-900">
                              {stockQuantityText(content.quantity)} {content.material.stockUnit} / {stockQuantityText(selectedStock.packagingDefinition!.outputQuantity)} {selectedStock.packagingDefinition!.outputUnit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectedStock.packagingSummary && (
                    <section className="mt-5 border-t border-emerald-100 pt-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-emerald-900">包装穿透</h3>
                          <div className="mt-1 text-xs text-gray-500">散装与包装库存等效汇总</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-800">
                            {stockQuantityText(Number(selectedStock.qty) + Number(selectedStock.packagingSummary.packagedEquivalentQty))}
                          </div>
                          <div className="text-[11px] text-gray-500">{selectedStock.material?.stockUnit || selectedStock.product?.unit}</div>
                        </div>
                      </div>
                      <div className="mt-3 divide-y divide-emerald-100 border-y border-emerald-100">
                        <div className="flex justify-between gap-3 py-2 text-xs">
                          <span className="text-gray-600">散装实际库存</span>
                          <span className="font-medium text-gray-900">{stockQuantityText(selectedStock.qty)} {selectedStock.material?.stockUnit}</span>
                        </div>
                        {selectedStock.packagingSummary.sources.map((source) => (
                          <div key={source.stockId} className="py-2.5 text-xs">
                            <div className="flex justify-between gap-3">
                              <span className="min-w-0 truncate text-gray-700">{source.material.code} · {source.material.name}</span>
                              <span className="shrink-0 font-medium text-emerald-800">等效 {stockQuantityText(source.equivalentQty)} {selectedStock.material?.stockUnit}</span>
                            </div>
                            <div className="mt-1 text-gray-500">实际 {stockQuantityText(source.qty)} {source.material.stockUnit} · {source.bom.name} {source.bom.version}</div>
                            {source.locations.map((location) => (
                              <div key={location.locationId} className="mt-1 flex justify-between gap-3 pl-2 text-[11px] text-gray-500">
                                <span className="truncate">{location.code} · {location.name}</span>
                                <span className="shrink-0">{stockQuantityText(location.qty)} {source.material.stockUnit} → {stockQuantityText(location.equivalentQty)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </aside>
              )}
            </div>
          </div>
        )}

        {adjustingStock && (
          <ModalDialog
            title="存货调整"
            description={`${adjustingStock.material?.name || adjustingStock.product?.name} · ${adjustingStock.material?.code || adjustingStock.product?.sku}`}
            onClose={() => setAdjustingStock(null)}
            closeDisabled={loading}
            footer={(
              <ModalActions
                onCancel={() => setAdjustingStock(null)}
                onConfirm={submitStockAdjust}
                confirmLabel="确认调整"
                busy={loading}
              />
            )}
          >
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  调整只作用于所选库位，并同步更新物料总库存。用于期初录入、盘点差异、损耗和早期数据尾差修正；来料单整单冲销仍使用“红冲”。
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">调整库位</label>
                  <SearchableSelect
                    value={stockAdjustForm.locationId}
                    onChange={(locationId) => {
                      const balance = adjustingStock.locationBalances.find((item) => item.locationId === locationId)
                      setStockAdjustForm({
                        ...stockAdjustForm,
                        locationId,
                        newLocationQty: Number(balance?.qty || 0),
                      })
                    }}
                    options={inventoryLocations.map((location) => {
                      const balance = adjustingStock.locationBalances.find((item) => item.locationId === location.id)
                      return {
                        value: location.id,
                        label: `${location.code} · ${location.name}（当前 ${Number(balance?.qty || 0)} ${adjustingStock.material?.stockUnit || adjustingStock.product?.unit}）`,
                      }
                    })}
                    placeholder="输入库位编码或名称筛选"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      调整后库位库存 {adjustingStock.material ? `(${adjustingStock.material.stockUnit || adjustingStock.material.unit})` : `(${adjustingStock.product?.unit || ''})`}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={stockAdjustForm.newLocationQty || ''}
                      onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newLocationQty: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      调整后核算库存 {adjustingStock.material ? `(${adjustingStock.material.valuationUnit})` : ''}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={stockAdjustForm.newValuationQty || ''}
                      onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newValuationQty: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  调整后物料总库存：{
                    Number((
                      Number(adjustingStock.qty)
                      - Number(adjustingStock.locationBalances.find((item) => item.locationId === stockAdjustForm.locationId)?.qty || 0)
                      + Number(stockAdjustForm.newLocationQty || 0)
                    ).toFixed(6))
                  } {adjustingStock.material?.stockUnit || adjustingStock.product?.unit}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">调整后库存金额</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={stockAdjustForm.newTotalCost || ''}
                    onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newTotalCost: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">调整原因</label>
                  <textarea
                    rows={3}
                    value={stockAdjustForm.reason}
                    onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, reason: e.target.value })}
                    placeholder="例如：期初录入、早期数据成本尾差调整、盘点损耗、称重误差"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
          </ModalDialog>
        )}

        {showStockHelp && (
          <ModalDialog
            title="存货调整说明"
            onClose={() => setShowStockHelp(false)}
            footer={<AppButton variant="primary" onClick={() => setShowStockHelp(false)}>知道了</AppButton>}
          >
              <div className="space-y-3 text-sm text-gray-600">
                <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
                  先建立物料，系统会自动生成 0 库存记录；再回到库存页，在对应库存卡片中点击“存货调整”，填写调整后数量、核算重量、库存金额和原因。
                </div>
                <p>存货调整统一覆盖期初录入、盘点差异、损耗、早期数据尾差和初始化库存。所有调整都会写入操作日志，不做物理删除。</p>
                <p>已经有来料单、领料、红冲等业务单据时，优先使用对应业务单据；存货调整只处理非单据型差异。</p>
              </div>
          </ModalDialog>
        )}

        {/* 物料与 BOM */}
        {tab === 'materials' && materialSection === 'materials' && (
          <MaterialPage
            onMessage={showMessage}
            showBomWorkspace={false}
            canReadBom={canRead('bomCost')}
            canCreateBom={canUpdate('bomCost')}
            onOpenBomWorkspace={(materialId) => openBomEditor(materialId)}
          />
        )}
        {tab === 'materials' && materialSection === 'bomWorkspace' && (
          <MaterialPage
            onMessage={showMessage}
            showBomWorkspace
            openBomRequest={bomEditorTarget}
            onOpenBomRequestHandled={clearBomEditorTarget}
          />
        )}
        {tab === 'materials' && materialSection === 'bomUsage' && (
          <div className="min-w-0">
            <BomOverviewPage
              onMessage={showMessage}
              onOpenBom={openBomEditor}
            />
          </div>
        )}

        {/* 产品文档 */}
        {tab === 'workInstructions' && <WorkInstructionPage onMessage={showMessage} />}

        {/* 设备台账 */}
        {tab === 'equipment' && <EquipmentPage onMessage={showMessage} canCreate={canCreate('equipment')} canUpdate={canUpdate('equipment')} canDelete={operator.role === 'ADMIN' || Boolean(operator.permissions?.equipment?.canDelete)} />}

        {/* 来料管理 */}
        {tab === 'materialIn' && <MaterialInPage onMessage={showMessage} />}

        {/* 派工管理 */}
        {tab === 'dispatch' && (
          <DispatchPage
            onMessage={showMessage}
          />
        )}

        {/* 销售订单 */}
        {tab === 'salesOrders' && <SalesOrderPage onMessage={showMessage} onOpenShipment={() => navigateToTab('shipment')} />}

        {/* 发货管理 */}
        {tab === 'shipment' && <ShipmentPage onMessage={showMessage} />}

        {/* 退货管理 */}
        {tab === 'return' && <ReturnPage onMessage={showMessage} />}

        {/* 流程转移 */}
        {tab === 'flowTransfers' && <FlowTransferPage onMessage={showMessage} />}

        {/* 员工资料 */}
        {tab === 'employees' && <EmployeePage onMessage={showMessage} canCreate={canCreate('system')} canUpdate={canUpdate('system')} />}

        {/* 锯切加工成本计算 */}
        {tab === 'sawingCost' && <SawingCostCalculatorPage />}

        {/* 扫码计数与标签打印底座 */}
        {tab === 'scanPrint' && <ScanPrintPage onMessage={showMessage} />}

        {/* 人员管理 */}
        {tab === 'operators' && <OperatorPage currentOperator={operator} onMessage={showMessage} />}

        {/* 分布在生产、物流和工具菜单中的管理页面 */}
        {activeSystemSection && <SystemPage section={activeSystemSection} onMessage={showMessage} />}

        {/* 人员权限控制 */}
        {tab === 'permissionUsers' && <PermissionPage mode="users" onMessage={showMessage} />}

        {/* 组权限控制 */}
        {tab === 'permissionGroups' && <PermissionPage mode="groups" onMessage={showMessage} />}
        </PageModuleBoundary>
        </div>
      </main>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[70] mes-modal-overlay lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="全部功能"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,380px)] flex-col overflow-hidden border-r border-gray-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
              <div>
                <div className="text-base font-semibold text-gray-900">全部功能</div>
                <div className="mt-0.5 text-xs text-gray-500">MES-lite v{appVersion}</div>
              </div>
              <button
                type="button"
                aria-label="关闭全部功能"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <section aria-label="底部常用入口">
                <div className="sticky top-0 z-10 border-b border-gray-100 bg-white py-3 text-xs font-semibold text-gray-500">
                  底部常用入口
                </div>
                <div>
                  {baseMobileNavItems.map((item, index) => (
                    <div key={item.key} className="flex min-h-12 items-center gap-2 border-b border-gray-100 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigateToTab(item.key)
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-medium ${
                          tab === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <MenuIcon icon={item.key} />
                        <span className="truncate">{item.label}</span>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label={`${item.label} 在常用入口中上移`}
                          disabled={index === 0}
                          onClick={() => moveNavItem(item.key, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-25"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`${item.label} 在常用入口中下移`}
                          disabled={index === baseMobileNavItems.length - 1}
                          onClick={() => moveNavItem(item.key, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-25"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {visibleBusinessGroups.map((group) => (
                <section key={group.key} aria-label={group.label} className="pt-2">
                  <div className="border-b border-gray-200 py-3 text-sm font-semibold text-gray-900">
                    {group.label}
                  </div>
                  <div>
                    {group.items.map((item) => {
                      const isFavorite = baseMobileNavItems.some((favorite) => favorite.key === item.key)
                      return (
                        <div key={item.key} className="flex min-h-12 items-center gap-2 border-b border-gray-100 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigateToTab(item.key)
                            }}
                            className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm font-medium ${
                              tab === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <MenuIcon icon={item.key} />
                            <span className="truncate">{item.label}</span>
                          </button>
                          {isFavorite ? (
                            <span className="shrink-0 px-2 py-1 text-xs font-medium text-blue-600">
                              常用
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMobileFavorite(item.key)}
                              className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              设为常用
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}

      {canRead('aiAssistant') && (
        <AiAssistantPanel
          open={aiAssistantOpen}
          onClose={closeAiAssistant}
          onOpenSettings={() => {
            setAiAssistantOpen(false)
            navigateToTab('aiSettings')
          }}
          pageContext={{ key: pageLocationKey, label: activeTabLabel }}
          isAdmin={operator.role === 'ADMIN'}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(mobilePrimaryItems.length + (canRead('aiAssistant') ? 1 : 0), 1)}, minmax(0, 1fr))` }}
        >
          {mobilePrimaryItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                navigateToTab(item.key)
              }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                tab === item.key ? 'bg-blue-600 text-white shadow-sm [&_span:first-child]:bg-white/15 [&_span:first-child]:text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <MenuIcon icon={item.key} />
              <span className="max-w-full truncate">{compactNavLabel(item.label)}</span>
            </button>
          ))}
          {canRead('aiAssistant') && (
            <button
              type="button"
              onClick={() => {
                setAiAssistantOpen(true)
                setSystemMenuOpen(false)
                setMobileNavOpen(false)
              }}
              aria-label="打开 AI 协作助手"
              className="mes-ai-assistant-trigger flex min-w-0 flex-col items-center justify-center gap-1 bg-transparent px-1 py-2 text-[11px] font-medium text-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            >
              <AiAssistantMark animated priority className="h-8 w-8" />
              <span className="max-w-full truncate">问 AI</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}

const dashboardToneMap: Record<string, { border: string; bg: string; text: string; fill: string; soft: string }> = {
  blue: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', fill: 'bg-blue-500', soft: 'bg-blue-100' },
  indigo: { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', fill: 'bg-indigo-500', soft: 'bg-indigo-100' },
  green: { border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700', fill: 'bg-green-500', soft: 'bg-green-100' },
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', fill: 'bg-emerald-500', soft: 'bg-emerald-100' },
  yellow: { border: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-700', fill: 'bg-yellow-500', soft: 'bg-yellow-100' },
  orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', fill: 'bg-orange-500', soft: 'bg-orange-100' },
  red: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', fill: 'bg-red-500', soft: 'bg-red-100' },
  pink: { border: 'border-pink-200', bg: 'bg-pink-50', text: 'text-pink-700', fill: 'bg-pink-500', soft: 'bg-pink-100' },
}

function getDashboardTone(tone: string) {
  return dashboardToneMap[tone] || {
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    fill: 'bg-gray-500',
    soft: 'bg-gray-100',
  }
}

function DashboardKpiGrid({ items }: { items: { label: string; value: number; tone: string; hint: string }[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => {
        const tone = getDashboardTone(item.tone)
        const percent = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))

        return (
          <div key={item.label} className={`rounded-lg border bg-white p-4 shadow-sm ${tone.border}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500">{item.hint}</div>
                <div className="mt-1 truncate text-sm font-semibold text-gray-800">{item.label}</div>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.fill}`} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="text-3xl font-semibold leading-none text-gray-950">{item.value ?? 0}</div>
              <div className={`h-10 w-16 rounded ${tone.soft} p-1`}>
                <div className="flex h-full items-end gap-1">
                  {[0.42, 0.72, 0.55, 1].map((ratio, index) => (
                    <span
                      key={index}
                      className={`flex-1 rounded-sm ${tone.fill}`}
                      style={{ height: `${Math.max(18, percent * ratio)}%`, opacity: 0.5 + index * 0.12 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardBarPanel({ title, items }: { title: string; items: { label: string; value: number; tone: string }[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">今日 / 本月</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const tone = getDashboardTone(item.tone)
          const width = Math.max(5, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))

          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{item.label}</span>
                <span className="font-semibold text-gray-950">{item.value ?? 0}</span>
              </div>
              <div className={`h-3 overflow-hidden rounded-full ${tone.soft}`}>
                <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardSignalGrid({
  title,
  items,
}: {
  title: string
  items: { label: string; value: number; tone: string; hint: string }[]
}) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">实时状态</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const tone = getDashboardTone(item.tone)
          const width = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))

          return (
            <div key={item.label} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{item.label}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{item.hint}</div>
                </div>
                <div className={`text-2xl font-semibold leading-none ${tone.text}`}>{item.value ?? 0}</div>
              </div>
              <div className={`mt-3 h-2.5 overflow-hidden rounded-full ${tone.soft}`}>
                <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardStatusSection({
  title,
  totalLabel,
  emptyText,
  items,
  labels,
  palette,
}: {
  title: string
  totalLabel: string
  emptyText: string
  items: { status: string; count: number }[]
  labels: Record<string, string>
  palette: Record<string, string>
}) {
  const normalizedItems = [...items].sort((a, b) => (b.count || 0) - (a.count || 0))
  const total = normalizedItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  let cursor = 0
  const segments = normalizedItems.map((item) => {
    const share = total > 0 ? (Number(item.count) / total) * 100 : 0
    const start = cursor
    const end = cursor + share
    cursor = end
    return { ...item, start, end, color: palette[item.status] || '#64748b' }
  })
  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})`
    : 'conic-gradient(#e5e7eb 0% 100%)'

  return (
    <section className="rounded-lg border border-gray-100 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">合计 {total}</span>
      </div>
      <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[136px_minmax(0,1fr)]">
        <div className="flex justify-center">
          <div className="relative h-32 w-32 rounded-full shadow-inner" style={{ background: gradient }}>
            <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white shadow-sm">
              <div className="text-2xl font-semibold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500">{totalLabel}</div>
            </div>
          </div>
        </div>
        {segments.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-2.5">
            {segments.map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate font-medium text-gray-700">{labels[item.status] || item.status}</span>
                </div>
                <span className="shrink-0 font-semibold text-gray-950">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ProductionStatusOverview({
  orderItems,
  actualItems,
}: {
  orderItems: { status: string; count: number }[]
  actualItems: { status: string; count: number }[]
}) {
  const orderPalette: Record<string, string> = {
    DRAFT: '#94a3b8',
    CONFIRMED: '#3b82f6',
    PICKED: '#eab308',
    RUNNING: '#f97316',
    QC_WAITING: '#a855f7',
    QC_DONE: '#6366f1',
    COMPLETED: '#22c55e',
    CANCELLED: '#ef4444',
  }
  const actualLabels = { DRAFT: '草稿', CONFIRMED: '已确认', REVERSED: '已冲销' }
  const actualPalette = { DRAFT: '#94a3b8', CONFIRMED: '#22c55e', REVERSED: '#ef4444' }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">生产状态分布</h3>
        <span className="text-xs text-gray-500">生产订单 / 班后实绩</span>
      </div>
      <div className="space-y-4">
        <DashboardStatusSection
          title="生产订单"
          totalLabel="总订单"
          emptyText="暂无生产订单状态数据"
          items={orderItems}
          labels={statusLabels}
          palette={orderPalette}
        />
        <DashboardStatusSection
          title="班后生产实绩"
          totalLabel="总实绩"
          emptyText="暂无班后实绩状态数据"
          items={actualItems}
          labels={actualLabels}
          palette={actualPalette}
        />
      </div>
    </div>
  )
}

function StockAlertList({ stocks }: { stocks: any[] }) {
  const sortedStocks = [...stocks].sort((a, b) => Number(a.availableQty ?? 0) - Number(b.availableQty ?? 0)).slice(0, 8)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">库存预警</h3>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">低于 10</span>
      </div>
      {sortedStocks.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
          暂无库存预警
        </div>
      ) : (
        <div className="space-y-3">
          {sortedStocks.map((stock, index) => {
            const name = stock.material?.name || stock.product?.name || '未命名库存'
            const code = stock.material?.code || stock.product?.sku || '-'
            const available = Number(stock.availableQty ?? 0)
            const level = available <= 2 ? '严重' : available <= 5 ? '紧急' : '关注'
            const levelClass =
              available <= 2 ? 'bg-red-50 text-red-700 border-red-200' :
              available <= 5 ? 'bg-orange-50 text-orange-700 border-orange-200' :
              'bg-yellow-50 text-yellow-700 border-yellow-200'
            const barClass = available <= 2 ? 'bg-red-500' : available <= 5 ? 'bg-orange-500' : 'bg-yellow-500'
            const width = Math.max(4, Math.min(100, (available / 10) * 100))

            return (
              <div key={stock.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">
                        {index + 1}
                      </span>
                      <div className="truncate text-sm font-medium text-gray-900">{name}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">{code}</div>
                  </div>
                  <div className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${levelClass}`}>
                    {level}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">可用库存</span>
                  <span className="font-semibold text-gray-900">{available}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
