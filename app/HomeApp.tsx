'use client'

// 应用壳实现；业务垂直切片通过 modules/<domain> 的公开入口挂载。

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Boxes, Menu, PanelLeftOpen, PanelRightOpen, PencilLine, Pin, PinOff, Search, X } from 'lucide-react'
import AuthGate, { CurrentOperator, OperatorBadge } from './components/AuthGate'
import ResponsiveToolbarActions from './components/ResponsiveToolbarActions'
import { InterfacePreferenceSync, preferenceChangeEvent, readDesktopNavigationPreference, useSiblingNavigationPreference, useWorkspaceLayoutPreference } from './components/interfacePreferences'
import AiAssistantMark from './components/AiAssistantMark'
import AppLoadingIndicator from './components/AppLoadingIndicator'
import { AllFunctionsPage } from './components/WorkspacePages'
import {
  businessNavGroups,
  lightweightHiddenResources,
  readPageContinuity,
  systemSectionByTab,
  workspaceFunctionCatalog,
  writePageContinuity,
  type BusinessNavGroupKey,
  type MaterialSection,
  type TabType,
} from './app-navigation'
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
  type DesktopNavigationMode,
} from './components/navigation/DesktopNavigation'
import DesktopTopNavigation from './components/navigation/DesktopTopNavigation'
import MobileSiblingNavigation from './components/navigation/MobileSiblingNavigation'
import type { NavigationGroup, NavigationItem } from './components/navigation/NavigationModel'
import UnifiedNavigationMenu from './components/navigation/UnifiedNavigationMenu'
import WorkspaceDomainTabs from './components/navigation/WorkspaceDomainTabs'
import useWorkspaceNavigation from './components/navigation/useWorkspaceNavigation'
import PageQrCodeButton from './components/PageQrCodeButton'
import ControlTooltip from './components/ControlTooltip'
import {
  workspaceContainsFunction,
  workspaceFunctionLabel,
  type NavigationWorkspaceId,
} from '@/lib/workspace-navigation-config'

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
const DocumentCategorySettingsPage = dynamic(() => import('@/modules/configuration').then((module) => module.DocumentCategorySettingsPage), { loading: FeaturePageLoading })
const EquipmentPage = dynamic(() => import('./components/EquipmentPage'), { loading: FeaturePageLoading })
const OperatorPage = dynamic(() => import('./components/OperatorPage'), { loading: FeaturePageLoading })
const SystemPage = dynamic(() => import('./components/SystemPage'), { loading: FeaturePageLoading })
const PermissionPage = dynamic(() => import('./components/PermissionPage'), { loading: FeaturePageLoading })
const AiAssistantPanel = dynamic(() => import('./components/AiAssistantPanel'))
const DashboardPage = dynamic(() => import('@/modules/workspace'), { loading: FeaturePageLoading })
const ProductionOrderModule = dynamic(() => import('@/modules/production'), { loading: FeaturePageLoading })
const StockPageModule = dynamic(() => import('@/modules/inventory'), { loading: FeaturePageLoading })

// ==================== 类型定义 ====================

interface BomEditorTarget {
  materialId: string
  bomId?: string
  requestId: number
}

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
    documentCategories: '类',
    locationSettings: '位',
    workCenters: '中',
    businessSettings: '业',
    displaySettings: '显',
    navigationSettings: '导',
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
  open,
  onToggle,
  onLogout,
  compact = false,
}: {
  containerRef: RefObject<HTMLDivElement>
  operator: CurrentOperator
  open: boolean
  onToggle: () => void
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
  const { config: workspaceNavigationConfig, activeWorkspace, setActiveWorkspace } = useWorkspaceNavigation()
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
    { key: 'documentCategories', label: '文档类别', resource: 'workInstructions' },
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
    { key: 'navigationSettings', label: '导航与工作区', resource: 'system' },
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
  const readableWorkspaceFunctionItems = workspaceFunctionCatalog.filter((item) => (
    canRead(item.resource) && (!item.extraResource || canRead(item.extraResource))
  ))
  const configuredFunctionOrder = new Map(
    workspaceNavigationConfig.workspaces[activeWorkspace].items.map((item, index) => [item.functionKey, index]),
  )
  const defaultFunctionOrder = new Map(workspaceFunctionCatalog.map((item, index) => [item.key, index]))
  const workspaceFunctionItems = readableWorkspaceFunctionItems
    .filter((item) => workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, item.key))
    .map((item) => ({
      ...item,
      label: workspaceFunctionLabel(workspaceNavigationConfig, activeWorkspace, item.key, item.label),
    }))
    .sort((left, right) => (
      Number(configuredFunctionOrder.get(left.key) ?? 1000 + Number(defaultFunctionOrder.get(left.key) ?? 999))
      - Number(configuredFunctionOrder.get(right.key) ?? 1000 + Number(defaultFunctionOrder.get(right.key) ?? 999))
    ))
  const visibleWorkspaceTabs = new Set(workspaceFunctionItems.map((item) => item.tab))
  const labelForTab = (item: { key: TabType; label: string }) => {
    if (item.key === 'materials' || item.key === 'allFunctions') return item.label
    return workspaceFunctionItems.find((functionItem) => functionItem.tab === item.key)?.label || item.label
  }
  const rankForTab = (key: TabType) => {
    const ranks = workspaceFunctionItems
      .filter((item) => item.tab === key)
      .map((item) => Number(configuredFunctionOrder.get(item.key) ?? 1000 + Number(defaultFunctionOrder.get(item.key) ?? 999)))
    return ranks.length > 0 ? Math.min(...ranks) : 9999
  }
  const readableBusinessNavItems = baseNavItems
    .filter((item) => canReadNavItem(item) && !accountMenuKeys.has(item.key) && !hiddenResources.has(item.resource))
    .filter((item) => item.key === 'allFunctions' || visibleWorkspaceTabs.has(item.key))
    .map((item) => ({ ...item, label: labelForTab(item) }))
    .sort((left, right) => rankForTab(left.key) - rankForTab(right.key))
  const readableSystemNavItems = baseNavItems
    .filter((item) => canRead(item.resource) && accountMenuKeys.has(item.key) && !hiddenResources.has(item.resource))
    .map((item) => ({ ...item, label: labelForTab(item) }))
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
  const [workspacePreference, setWorkspacePreference] = useState<WorkspacePreferenceValue>(defaultWorkspacePreference)
  const [productionOrderStateSummary, setProductionOrderStateSummary] = useState('页面：生产订单')
  const [stockStateSummary, setStockStateSummary] = useState('页面：库存管理')
  const [message, setMessage] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [desktopNavigationMode, setDesktopNavigationMode] = useState<DesktopNavigationMode>('accordion')
  const [desktopNavigationDisplayMode, setDesktopNavigationDisplayMode] = useState<DesktopNavigationDisplayMode>('icon-label')
  const [workspaceLayoutPreference, setWorkspaceLayoutPreference] = useWorkspaceLayoutPreference()
  const [siblingNavigationEnabled] = useSiblingNavigationPreference()
  const [transientDesktopNavigationOpen, setTransientDesktopNavigationOpen] = useState(false)
  const [desktopSidebarWidth, setDesktopSidebarWidth] = useState(defaultDesktopSidebarWidth)
  const [desktopSplitSidebarWidth, setDesktopSplitSidebarWidth] = useState(defaultDesktopSplitSidebarWidth)
  const [desktopSidebarReady, setDesktopSidebarReady] = useState(false)
  const [wideDesktopNavigation, setWideDesktopNavigation] = useState(false)
  const [resizingDesktopSidebar, setResizingDesktopSidebar] = useState<DesktopNavigationMode | null>(null)
  const [pageUrlReady, setPageUrlReady] = useState(false)
  const systemMenuRef = useRef<HTMLDivElement>(null)
  const desktopSystemMenuRef = useRef<HTMLDivElement>(null)
  const desktopNavigationPanelRef = useRef<HTMLElement>(null)
  const desktopNavigationTriggerRef = useRef<HTMLButtonElement>(null)
  const desktopNavigationOpenTimerRef = useRef<number | null>(null)
  const desktopNavigationCloseTimerRef = useRef<number | null>(null)
  const pageContentRef = useRef<HTMLDivElement>(null)
  const pageUrlInitializedRef = useRef(false)
  const navOrderLoadedRef = useRef(false)
  const readableBusinessNavItemsRef = useRef(readableBusinessNavItems)
  readableBusinessNavItemsRef.current = readableBusinessNavItems
  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>(readableBusinessNavItems)
  const materialSectionItems = [
    { key: 'materials' as const, functionKey: 'materialManagement' as const, label: '物料管理', visible: canRead('materials') },
    { key: 'bomWorkspace' as const, functionKey: 'bomWorkspace' as const, label: 'BOM 设置', visible: canRead('materials') && canRead('bomCost') },
    { key: 'bomUsage' as const, functionKey: 'bomUsage' as const, label: 'BOM 全览', visible: canRead('bomCost') },
  ].filter((item) => item.visible)
    .filter((item) => workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, item.functionKey))
    .map((item) => ({
      ...item,
      label: workspaceFunctionLabel(workspaceNavigationConfig, activeWorkspace, item.functionKey, item.label),
    }))
  const tabLabels: Record<string, string> = Object.fromEntries(
    [...baseNavItems, ...readableBusinessNavItems, ...readableSystemNavItems].map((item) => [item.key, item.label]),
  )
  tabLabels.create = '创建生产订单'
  tabLabels.detail = '生产订单详情'
  const activeTabLabel = tab === 'materials'
    ? materialSectionItems.find((item) => item.key === materialSection)?.label || '物料与 BOM'
    : tabLabels[tab] || 'MES-lite'
  const activeSystemSection = systemSectionByTab[tab]
  const activePageModule = getPageModuleDefinition(resolvePageModuleKey(tab, materialSection))
  const activeFunctionKey: WorkspaceFunctionKey = tab === 'materials'
    ? materialSection === 'bomWorkspace' ? 'bomWorkspace' : materialSection === 'bomUsage' ? 'bomUsage' : 'materialManagement'
    : tab === 'create' || tab === 'detail'
      ? 'orders'
      : workspaceFunctionCatalog.find((item) => item.tab === tab)?.key || 'dashboard'
  const activeSystemTab = readableSystemNavItems.some((item) => item.key === tab)
  const activeBusinessGroupKey: BusinessNavGroupKey = tab === 'create' || tab === 'detail'
    ? 'production'
    : businessNavGroups.find((group) => group.tabs.includes(tab))?.key || 'workspace'
  const configuredGroupOrder = new Map(
    workspaceNavigationConfig.workspaces[activeWorkspace].groupOrder.map((groupKey, index) => [groupKey, index]),
  )
  const visibleBusinessGroups = businessNavGroups
    .map((group) => ({
      ...group,
      items: navItems.filter((item) => group.tabs.includes(item.key)),
      workspaceOrder: Number(configuredGroupOrder.get(group.key) ?? 10000 + businessNavGroups.indexOf(group)),
    }))
    .filter((group) => group.items.length > 0)
    .sort((left, right) => left.workspaceOrder - right.workspaceOrder)
  const navigationOrderStorageKey = `mes-lite.nav.order.${activeWorkspace}`
  const readableNavigationSignature = readableBusinessNavItems.map((item) => `${item.key}:${item.label}`).join('|')
  const activeMaterialSectionVisible = materialSectionItems.some((item) => item.key === materialSection)
  const firstMaterialSectionKey = materialSectionItems[0]?.key
  const pageLocationKey = tab === 'materials' ? `${tab}:${materialSection}` : tab
  const activeGroupLabel = activeSystemTab
    ? '账号与权限'
    : businessNavGroups.find((group) => group.key === activeBusinessGroupKey)?.label || 'MES-lite'
  const activeFunctionPath = `${activeGroupLabel} / ${activeTabLabel}`
  const activeStateSummary = tab === 'orders' || tab === 'create' || tab === 'detail'
    ? productionOrderStateSummary
    : tab === 'stocks'
      ? stockStateSummary
      : tab === 'materials'
        ? `子页面：${activeTabLabel}`
        : `页面：${activeTabLabel}`
  const standardWorkspaceLayout = workspaceLayoutPreference.layout === 'sidebar'
  const autoHideDesktopNavigation = standardWorkspaceLayout && workspaceLayoutPreference.navigationBehavior === 'auto-hide'
  const persistentDesktopNavigation = standardWorkspaceLayout && workspaceLayoutPreference.navigationBehavior === 'persistent'

  const cancelDesktopNavigationClose = useCallback(() => {
    if (desktopNavigationCloseTimerRef.current === null) return
    window.clearTimeout(desktopNavigationCloseTimerRef.current)
    desktopNavigationCloseTimerRef.current = null
  }, [])

  const cancelDesktopNavigationOpen = useCallback(() => {
    if (desktopNavigationOpenTimerRef.current === null) return
    window.clearTimeout(desktopNavigationOpenTimerRef.current)
    desktopNavigationOpenTimerRef.current = null
  }, [])

  const openTransientDesktopNavigation = useCallback(() => {
    if (!autoHideDesktopNavigation) return
    cancelDesktopNavigationOpen()
    cancelDesktopNavigationClose()
    setTransientDesktopNavigationOpen(true)
  }, [autoHideDesktopNavigation, cancelDesktopNavigationClose, cancelDesktopNavigationOpen])

  const scheduleDesktopNavigationOpen = useCallback(() => {
    if (!autoHideDesktopNavigation || transientDesktopNavigationOpen || desktopNavigationOpenTimerRef.current !== null) return
    cancelDesktopNavigationClose()
    desktopNavigationOpenTimerRef.current = window.setTimeout(() => {
      setTransientDesktopNavigationOpen(true)
      desktopNavigationOpenTimerRef.current = null
    }, 120)
  }, [autoHideDesktopNavigation, cancelDesktopNavigationClose, transientDesktopNavigationOpen])

  const scheduleDesktopNavigationClose = useCallback(() => {
    if (!autoHideDesktopNavigation || resizingDesktopSidebar) return
    cancelDesktopNavigationClose()
    desktopNavigationCloseTimerRef.current = window.setTimeout(() => {
      setTransientDesktopNavigationOpen(false)
      desktopNavigationCloseTimerRef.current = null
    }, 350)
  }, [autoHideDesktopNavigation, cancelDesktopNavigationClose, resizingDesktopSidebar])

  useEffect(() => {
    if (autoHideDesktopNavigation) return
    cancelDesktopNavigationOpen()
    cancelDesktopNavigationClose()
    setTransientDesktopNavigationOpen(false)
  }, [autoHideDesktopNavigation, cancelDesktopNavigationClose, cancelDesktopNavigationOpen])

  useEffect(() => {
    if (!autoHideDesktopNavigation || !transientDesktopNavigationOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (desktopNavigationPanelRef.current?.contains(target) || desktopNavigationTriggerRef.current?.contains(target)) return
      cancelDesktopNavigationClose()
      setTransientDesktopNavigationOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancelDesktopNavigationClose()
      setTransientDesktopNavigationOpen(false)
      desktopNavigationTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [autoHideDesktopNavigation, cancelDesktopNavigationClose, transientDesktopNavigationOpen])

  useEffect(() => () => {
    cancelDesktopNavigationOpen()
    cancelDesktopNavigationClose()
  }, [cancelDesktopNavigationClose, cancelDesktopNavigationOpen])

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
    setPageUrlReady(true)
  }, [materialSectionItems, readableBusinessNavItems, readableSystemNavItems])

  useEffect(() => {
    if (!pageUrlReady) return
    const url = new URL(window.location.href)
    const shareablePage = tab === 'create' || tab === 'detail' ? 'orders' : tab
    url.searchParams.set('page', shareablePage)
    url.searchParams.delete('section')
    if (shareablePage !== 'orders' && shareablePage !== 'stocks') {
      url.searchParams.delete('view')
      url.searchParams.delete('q')
    }
    if (shareablePage !== 'orders') url.searchParams.delete('statuses')
    if (shareablePage !== 'stocks') {
      for (const key of ['stockType', 'customer', 'location', 'categories', 'invalid', 'stock']) url.searchParams.delete(key)
    }
    if (shareablePage === 'materials') url.searchParams.set('section', materialSection)
    window.history.replaceState(window.history.state, '', url)
  }, [materialSection, pageUrlReady, tab])

  useEffect(() => {
    const currentReadableItems = readableBusinessNavItemsRef.current
    const savedOrder = window.localStorage.getItem(navigationOrderStorageKey)
      || (activeWorkspace === 'mes' ? window.localStorage.getItem('mes-lite.nav.order') : null)
    if (savedOrder) {
      try {
        const savedKeys = JSON.parse(savedOrder) as TabType[]
        const itemByKey = new Map(currentReadableItems.map((item) => [item.key, item]))
        const ordered = savedKeys
          .map((key) => itemByKey.get(key))
          .filter(Boolean) as { key: TabType; label: string }[]
        const missing = currentReadableItems.filter((item) => !savedKeys.includes(item.key))
        setNavItems([...ordered, ...missing])
      } catch (error) {
        setNavItems(currentReadableItems)
      }
    } else {
      setNavItems(currentReadableItems)
    }
    navOrderLoadedRef.current = true
  }, [activeWorkspace, navigationOrderStorageKey, readableNavigationSignature])

  useEffect(() => {
    if (!navOrderLoadedRef.current) return
    window.localStorage.setItem(navigationOrderStorageKey, JSON.stringify(navItems.map((item) => item.key)))
  }, [navItems, navigationOrderStorageKey])

  useEffect(() => {
    if (tab !== 'materials' || activeMaterialSectionVisible) return
    if (firstMaterialSectionKey) setMaterialSection(firstMaterialSectionKey)
    else setTab('dashboard')
  }, [activeMaterialSectionVisible, firstMaterialSectionKey, tab])

  useEffect(() => {
    if (workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, activeFunctionKey)) return
    setTab('dashboard')
  }, [activeFunctionKey, activeWorkspace, workspaceNavigationConfig])

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
    setTransientDesktopNavigationOpen(false)
    setSystemMenuOpen(false)
    recordWorkspaceUsage(functionKey)
  }

  const navigateToTab = (nextTab: TabType, nextMaterialSection?: MaterialSection) => {
    if (nextTab === 'allFunctions') {
      setTab('allFunctions')
      setMobileNavOpen(false)
      setTransientDesktopNavigationOpen(false)
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
    setTransientDesktopNavigationOpen(false)
    setSystemMenuOpen(false)
  }

  const changeWorkspace = (nextWorkspace: NavigationWorkspaceId) => {
    if (nextWorkspace === activeWorkspace) return
    setActiveWorkspace(nextWorkspace)
    setTransientDesktopNavigationOpen(false)
    setMobileNavOpen(false)
    if (!workspaceContainsFunction(workspaceNavigationConfig, nextWorkspace, activeFunctionKey)) {
      setTab('dashboard')
    }
  }

  const splitNavigationVisible = desktopNavigationMode === 'split' && wideDesktopNavigation

  const navigationGroups: NavigationGroup[] = visibleBusinessGroups.map((group) => {
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
            shortcutKey: 'materials',
            onClick: () => navigateToTab('materials', section.key),
          }
        })
      : group.items.map((item) => {
          const index = navItems.findIndex((navItem) => navItem.key === item.key)
          return {
            id: item.key,
            label: item.label,
            active: tab === item.key || (item.key === 'orders' && (tab === 'create' || tab === 'detail')),
            icon: <MenuIcon icon={item.key} />,
            shortcutKey: item.key,
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
    navigationGroups.push({
      id: 'account',
      label: '账号与权限',
      icon: <MenuIcon icon="operators" />,
      active: activeSystemTab,
      items: readableSystemNavItems.map((item) => ({
        id: item.key,
        label: item.label,
        active: tab === item.key,
        icon: <MenuIcon icon={item.key} />,
        shortcutKey: item.key,
        onClick: () => navigateToTab(item.key),
      })),
      onClick: () => navigateToTab(readableSystemNavItems[0].key),
    })
  }
  navigationGroups.sort((left, right) => (
    Number(configuredGroupOrder.get(left.id as BusinessNavGroupKey) ?? 10000)
    - Number(configuredGroupOrder.get(right.id as BusinessNavGroupKey) ?? 10000)
  ))
  const activeNavigationGroup = navigationGroups.find((group) => group.active)
  const navigationItemByShortcutKey = new Map<string, NavigationItem>()
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.shortcutKey && !navigationItemByShortcutKey.has(item.shortcutKey)) {
        navigationItemByShortcutKey.set(item.shortcutKey, item)
      }
    }
  }
  const baseMobileNavItems = navItems.slice(0, 4)
  const mobilePrimaryItems = baseMobileNavItems.map((favorite) => {
    const navigationItem = navigationItemByShortcutKey.get(favorite.key)
    return {
      key: favorite.key,
      label: navigationItem?.label || favorite.label,
      active: navigationItem?.active ?? tab === favorite.key,
      onClick: navigationItem?.onClick || (() => navigateToTab(favorite.key)),
    }
  })

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-gray-50"
      data-desktop-navigation={desktopNavigationMode}
      data-workspace-layout={workspaceLayoutPreference.layout}
      data-desktop-navigation-behavior={workspaceLayoutPreference.navigationBehavior}
      data-navigation-workspace={activeWorkspace}
      style={{
        '--mes-desktop-sidebar-width': `${desktopSidebarWidth}px`,
        '--mes-desktop-split-sidebar-width': `${desktopSplitSidebarWidth}px`,
        '--mes-desktop-tools-width': '320px',
      } as CSSProperties}
    >
      <InterfacePreferenceSync />
      <header className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center border-b border-gray-200 bg-white lg:flex">
        <div className={`flex h-full shrink-0 items-center border-r border-gray-200 ${
          workspaceLayoutPreference.layout === 'canvas'
            ? 'w-44 gap-3 px-4'
            : persistentDesktopNavigation
              ? `w-[var(--mes-desktop-sidebar-width)] gap-3 px-4 ${desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''}`
              : 'w-16 justify-center px-2'
        }`}>
          {autoHideDesktopNavigation ? (
            <button
              ref={desktopNavigationTriggerRef}
              type="button"
              aria-label={transientDesktopNavigationOpen ? '收起功能导航' : '打开功能导航'}
              aria-expanded={transientDesktopNavigationOpen}
              onPointerEnter={scheduleDesktopNavigationOpen}
              onPointerLeave={cancelDesktopNavigationOpen}
              onFocus={scheduleDesktopNavigationOpen}
              onClick={() => {
                cancelDesktopNavigationOpen()
                cancelDesktopNavigationClose()
                setTransientDesktopNavigationOpen((open) => !open)
              }}
              className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
              <ControlTooltip label={transientDesktopNavigationOpen ? '收起功能导航' : '打开功能导航'} hidden={transientDesktopNavigationOpen} />
            </button>
          ) : (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-lg font-bold text-white">M</span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-gray-800">MES-lite</h1>
                <p className="truncate text-[11px] text-gray-500">生产系统 · v{appVersion}</p>
              </div>
            </>
          )}
        </div>
        {workspaceLayoutPreference.layout === 'canvas' && (
          <div className="w-48 shrink-0 border-r border-gray-100 px-2">
            <WorkspaceDomainTabs
              config={workspaceNavigationConfig}
              value={activeWorkspace}
              onChange={changeWorkspace}
              compact
            />
          </div>
        )}
        {workspaceLayoutPreference.layout === 'canvas' && <DesktopTopNavigation groups={navigationGroups} />}
        <div
          id="topbar-actions-desktop"
          aria-label="页面搜索、筛选和工具"
          className={`${workspaceLayoutPreference.layout === 'sidebar' ? 'flex' : 'hidden'} min-w-0 flex-1 items-center gap-3 overflow-visible px-4 empty:before:content-['']`}
        />
        <div className="flex h-full shrink-0 items-center gap-2 border-l border-gray-100 px-4">
          <button
            type="button"
            aria-label={workspaceLayoutPreference.layout === 'canvas' ? '切换到标准管理布局' : '切换到画布工作布局'}
            onClick={() => {
              cancelDesktopNavigationOpen()
              cancelDesktopNavigationClose()
              setTransientDesktopNavigationOpen(false)
              setWorkspaceLayoutPreference({ layout: workspaceLayoutPreference.layout === 'canvas' ? 'sidebar' : 'canvas' })
            }}
            className="group relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-blue-700"
          >
            {workspaceLayoutPreference.layout === 'canvas'
              ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
              : <PanelRightOpen aria-hidden="true" className="h-5 w-5" />}
            <ControlTooltip label={workspaceLayoutPreference.layout === 'canvas' ? '切换到标准管理布局' : '切换到画布工作布局'} />
          </button>
          {canRead('aiAssistant') && (
            <button
              type="button"
              onClick={() => {
                setAiAssistantOpen(true)
                setSystemMenuOpen(false)
              }}
              aria-label="打开 AI 协作助手"
              className="mes-ai-assistant-trigger group relative flex h-12 w-12 items-center justify-center rounded-full bg-transparent p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <AiAssistantMark animated priority className="h-11 w-11" />
              <ControlTooltip label="打开 AI 助手" hidden={aiAssistantOpen} />
            </button>
          )}
          <PageQrCodeButton
            pageTitle={activeTabLabel}
            functionPath={activeFunctionPath}
            stateSummary={activeStateSummary}
            compact
            triggerClassName="hidden xl:flex"
            listenForGlobalOpen
          />
          <SystemMenu
            containerRef={desktopSystemMenuRef}
            operator={operator}
            open={systemMenuOpen}
            onToggle={() => setSystemMenuOpen((open) => !open)}
            onLogout={() => {
              setSystemMenuOpen(false)
              onLogout()
            }}
          />
        </div>
      </header>

      <div
        id="page-tools-desktop"
        aria-label="右侧页面工具"
        className={`fixed bottom-0 right-0 top-16 z-30 hidden w-[var(--mes-desktop-tools-width)] border-l border-gray-200 bg-white ${workspaceLayoutPreference.layout === 'canvas' ? 'lg:flex' : 'lg:hidden'}`}
      />

      {autoHideDesktopNavigation && !transientDesktopNavigationOpen && (
        <div aria-hidden="true" onPointerEnter={scheduleDesktopNavigationOpen} onPointerLeave={cancelDesktopNavigationOpen} className="fixed bottom-0 left-0 top-16 z-30 hidden w-2 lg:block" />
      )}

      <aside
        ref={desktopNavigationPanelRef}
        onPointerEnter={autoHideDesktopNavigation ? openTransientDesktopNavigation : undefined}
        onPointerLeave={autoHideDesktopNavigation ? scheduleDesktopNavigationClose : undefined}
        onFocusCapture={autoHideDesktopNavigation ? openTransientDesktopNavigation : undefined}
        onBlurCapture={autoHideDesktopNavigation ? scheduleDesktopNavigationClose : undefined}
        className={`fixed bottom-0 left-0 top-16 hidden w-[var(--mes-desktop-sidebar-width)] flex-col border-r border-gray-200 bg-white transition-transform duration-200 motion-reduce:transition-none lg:flex ${
          desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''
        } ${workspaceLayoutPreference.layout === 'canvas'
          ? 'lg:hidden'
          : autoHideDesktopNavigation
            ? `z-40 shadow-2xl ${transientDesktopNavigationOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'z-30 translate-x-0'
        }`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-100 px-2">
          <div className="min-w-0 flex-1">
            <WorkspaceDomainTabs
              config={workspaceNavigationConfig}
              value={activeWorkspace}
              onChange={changeWorkspace}
              compact
            />
          </div>
          <button
            type="button"
            aria-label={autoHideDesktopNavigation ? '固定导航' : '改为自动隐藏'}
            onClick={() => {
              cancelDesktopNavigationOpen()
              cancelDesktopNavigationClose()
              if (autoHideDesktopNavigation) {
                setWorkspaceLayoutPreference({ navigationBehavior: 'persistent' })
                return
              }
              setWorkspaceLayoutPreference({ navigationBehavior: 'auto-hide' })
              setTransientDesktopNavigationOpen(false)
            }}
            className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            {autoHideDesktopNavigation ? <Pin aria-hidden="true" className="h-4 w-4" /> : <PinOff aria-hidden="true" className="h-4 w-4" />}
            <ControlTooltip label={autoHideDesktopNavigation ? '固定导航' : '改为自动隐藏'} />
          </button>
        </div>
        <DesktopNavigation mode={desktopNavigationMode} groups={navigationGroups} displayMode={desktopNavigationDisplayMode} />
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
            cancelDesktopNavigationOpen()
            cancelDesktopNavigationClose()
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

      <main className={`mes-mobile-main min-w-0 p-3 sm:p-4 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:p-6 lg:pb-0 lg:pt-20 ${
        persistentDesktopNavigation
          ? `lg:ml-[var(--mes-desktop-sidebar-width)] ${desktopNavigationMode === 'split' ? 'xl:ml-[var(--mes-desktop-split-sidebar-width)]' : ''}`
          : 'lg:ml-0'
      } ${workspaceLayoutPreference.layout === 'canvas' ? 'lg:mr-[var(--mes-desktop-tools-width)]' : 'lg:mr-0'}`}>
        <div className={`fixed inset-x-0 top-0 border-b border-gray-200 bg-gray-50/95 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] shadow-sm backdrop-blur sm:px-4 lg:hidden ${
          systemMenuOpen ? 'z-[60] lg:z-30' : 'z-30'
        }`}>
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
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
              {siblingNavigationEnabled && <MobileSiblingNavigation group={activeNavigationGroup} />}
              <div id="topbar-actions-mobile" className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-visible empty:hidden" />
              <SystemMenu
                containerRef={systemMenuRef}
                operator={operator}
                open={systemMenuOpen}
                onToggle={() => {
                  setSystemMenuOpen((open) => !open)
                  setMobileNavOpen(false)
                }}
                onLogout={() => {
                  setSystemMenuOpen(false)
                  onLogout()
                }}
                compact
              />
            </div>
            <TopBarPortal>
                {['dashboard', 'sawingCost', 'scanPrint', 'dataTools'].includes(activePageModule.key) ? (
                  <ResponsiveToolbarActions pageKey={activePageModule.key} />
                ) : null}
            </TopBarPortal>
          </div>
        </div>

        <div
          id="mes-page-content-host"
          ref={pageContentRef}
          aria-label="页面内容区"
          className="mes-page-content-scroll relative min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-scroll lg:overscroll-contain lg:pb-6 lg:[scrollbar-gutter:stable]"
        >
        <PageModuleBoundary
          definition={activePageModule}
          toolbarProvided={tab === 'orders' || tab === 'stocks' || tab === 'create' || tab === 'detail' || ['dashboard', 'sawingCost', 'scanPrint', 'dataTools'].includes(activePageModule.key)}
        >
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
        {tab === 'dashboard' && (
          <DashboardPage
            items={workspaceFunctionItems}
            preference={workspacePreference}
            onOpen={openWorkspaceFunction}
            onOpenAllFunctions={() => navigateToTab('allFunctions')}
            onSave={saveWorkspacePreference}
          />
        )}

        {/* 所有功能 */}
        {tab === 'allFunctions' && (
          <AllFunctionsPage
            items={workspaceFunctionItems}
            preference={workspacePreference}
            onOpen={openWorkspaceFunction}
          />
        )}

        {(tab === "orders" || tab === "create" || tab === "detail") && (
          <ProductionOrderModule
            mode={tab}
            canCreate={canCreate("orders")}
            onModeChange={setTab}
            onMessage={showMessage}
            onStateSummaryChange={setProductionOrderStateSummary}
          />
        )}

        {tab === 'stocks' && (
          <StockPageModule
            operatorName={operator.name || operator.username}
            canUpdateStock={canUpdate('stocks')}
            onMessage={showMessage}
            onStateSummaryChange={setStockStateSummary}
          />
        )}

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

        {/* 文档类别业务配置 */}
        {tab === 'documentCategories' && (
          <DocumentCategorySettingsPage
            onMessage={showMessage}
            canUpdate={canUpdate('workInstructions')}
            canDelete={operator.role === 'ADMIN' || Boolean(operator.permissions?.workInstructions?.canDelete)}
          />
        )}

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
        {tab === 'salesOrders' && <SalesOrderPage onMessage={showMessage} />}

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
            <div className="shrink-0 border-b border-gray-200 px-4 py-3">
              <WorkspaceDomainTabs
                config={workspaceNavigationConfig}
                value={activeWorkspace}
                onChange={changeWorkspace}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <section aria-label="底部常用入口">
                <div className="sticky top-0 z-10 border-b border-gray-100 bg-white py-3 text-xs font-semibold text-gray-500">
                  底部常用入口
                </div>
                <div>
                  {mobilePrimaryItems.map((item, index) => (
                    <div key={item.key} className="flex min-h-12 items-center gap-2 border-b border-gray-100 py-1">
                      <button
                        type="button"
                        onClick={item.onClick}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-medium ${
                          item.active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
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

              <UnifiedNavigationMenu
                groups={navigationGroups}
                groupHeaderMode="static"
                expandedGroupIds="all"
                ariaLabel="全部功能"
                className="space-y-2 pt-2"
                renderItemTrailing={(item, itemIndex, group) => {
                  const favoriteKey = item.shortcutKey as TabType | undefined
                  const managesFavorite = Boolean(favoriteKey) && group.items.findIndex((candidate) => candidate.shortcutKey === favoriteKey) === itemIndex
                  const isFavorite = Boolean(favoriteKey && baseMobileNavItems.some((favorite) => favorite.key === favoriteKey))
                  if (!managesFavorite || !favoriteKey) return null
                  if (isFavorite) return <span className="shrink-0 px-2 py-1 text-xs font-medium text-blue-600">常用</span>
                  return (
                    <button
                      type="button"
                      onClick={() => setMobileFavorite(favoriteKey)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      设为常用
                    </button>
                  )
                }}
              />
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
              onClick={item.onClick}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                item.active ? 'bg-blue-600 text-white shadow-sm [&_span:first-child]:bg-white/15 [&_span:first-child]:text-white' : 'text-gray-600 hover:bg-gray-100'
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
