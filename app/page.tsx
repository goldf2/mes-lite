'use client'

import { useState, useEffect, useRef } from 'react'
import MaterialInPage from './components/MaterialInPage'
import DispatchPage from './components/DispatchPage'
import ShipmentPage from './components/ShipmentPage'
import ReturnPage from './components/ReturnPage'
import StatsPage from './components/StatsPage'
import MaterialPage from './components/MaterialPage'
import WorkInstructionPage from './components/WorkInstructionPage'
import AttachmentPanel from './components/AttachmentPanel'
import AuthGate, { CurrentOperator, OperatorBadge } from './components/AuthGate'
import OperatorPage from './components/OperatorPage'
import SystemPage from './components/SystemPage'
import PermissionPage from './components/PermissionPage'
import StatusCheckboxFilter, { getMultiSelectQuery, getStatusQuery } from './components/StatusCheckboxFilter'
import ResponsiveToolbarActions from './components/ResponsiveToolbarActions'
import ViewModeToggle, { usePersistedViewMode } from './components/ViewModeToggle'
import useCompactViewport from './components/useCompactViewport'

// ==================== 类型定义 ====================

interface Product {
  id: string
  sku: string
  name: string
  category: string
  unit: string
}

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string
  category: string
  stockUnit: string
  valuationUnit: string
}

interface Customer {
  id: string
  code: string
  name: string
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
  material?: { id: string; code: string; name: string; spec: string; category?: string; customerId?: string | null; customer?: Customer | null; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number; deletedAt?: string | null }
  product?: { id: string; sku: string; name: string; category: string; customerId?: string | null; customer?: Customer | null; unit: string }
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
  voucherNo?: string | null
  status: string
  planQty: number
  completeQty: number
  scrapQty: number
  createdAt: string
  product: { id: string; name: string; sku: string }
  targetMaterial?: { id: string; name: string; code: string; category?: string; stockUnit?: string; unit?: string } | null
  _count: { reports: number; picks: number }
}

interface PickItem {
  id: string
  material: { id: string; code: string; name: string; unit: string }
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

type TabType = 'dashboard' | 'orders' | 'materials' | 'workInstructions' | 'materialIn' | 'dispatch' | 'stocks' | 'shipment' | 'return' | 'stats' | 'operators' | 'system' | 'permissionUsers' | 'permissionGroups' | 'permissions' | 'create' | 'detail'

// ==================== 菜单图标组件 ====================

function MenuIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    dashboard: '仪',
    orders: '工',
    materials: '料',
    workInstructions: '书',
    materialIn: '入',
    dispatch: '派',
    stocks: '库',
    shipment: '发',
    return: '退',
    stats: '析',
    operators: '人',
    system: '设',
    permissionUsers: '权',
    permissionGroups: '组',
    permissions: '限',
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[13px] font-semibold text-slate-700">
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
    { key: 'materials', label: '物料管理', resource: 'materials' },
    { key: 'workInstructions', label: '作业指导书', resource: 'workInstructions' },
    { key: 'materialIn', label: '来料管理', resource: 'materialIn' },
    { key: 'orders', label: '工单管理', resource: 'orders' },
    { key: 'dispatch', label: '派工管理', resource: 'dispatch' },
    { key: 'shipment', label: '发货管理', resource: 'shipment' },
    { key: 'return', label: '退货管理', resource: 'return' },
    { key: 'stocks', label: '库存管理', resource: 'stocks' },
    { key: 'stats', label: '统计分析', resource: 'stats' },
    { key: 'operators', label: '人员管理', resource: 'operators' },
    { key: 'system', label: '系统管理', resource: 'system' },
    { key: 'permissionUsers', label: '人员权限', resource: 'permissionUsers' },
    { key: 'permissionGroups', label: '组权限', resource: 'permissionGroups' },
  ]
  const hiddenResources = new Set<string>()
  const systemResources = new Set(['operators', 'system', 'permissionUsers', 'permissionGroups', 'permissions'])
  const readableBusinessNavItems = baseNavItems.filter((item) => canRead(item.resource) && !systemResources.has(item.resource) && !hiddenResources.has(item.resource))
  const readableSystemNavItems = baseNavItems.filter((item) => canRead(item.resource) && systemResources.has(item.resource) && !hiddenResources.has(item.resource))
  const [tab, setTab] = useState<TabType>('dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [orderTargetType, setOrderTargetType] = useState<'PRODUCT' | 'MATERIAL'>('PRODUCT')
  const [planQty, setPlanQty] = useState(100)
  const [orderVoucherNo, setOrderVoucherNo] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState(orderStatusOptions.map((option) => option.value))
  const [orderViewMode, setOrderViewMode] = usePersistedViewMode('mes-lite.orders.viewMode', 'card')
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockViewMode, setStockViewMode] = usePersistedViewMode('mes-lite.stocks.viewMode', 'card')
  const [stockCustomerFilter, setStockCustomerFilter] = useState('')
  const [selectedStockCategories, setSelectedStockCategories] = useState<string[]>(materialCategoryFilterOptions.map((option) => option.value))
  const [showInvalidStocks, setShowInvalidStocks] = useState(false)
  const [showStockHelp, setShowStockHelp] = useState(false)
  const [stockDataError, setStockDataError] = useState<{ message: string; issues: any[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const systemMenuRef = useRef<HTMLDivElement | null>(null)
  const navOrderLoadedRef = useRef(false)
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState({
    newQty: 0,
    newValuationQty: 0,
    newTotalCost: 0,
    reason: '',
  })
  const isCompactViewport = useCompactViewport()
  const effectiveOrderViewMode = isCompactViewport ? 'card' : orderViewMode
  const effectiveStockViewMode = isCompactViewport ? 'card' : stockViewMode

  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>(readableBusinessNavItems)
  const tabLabels: Record<string, string> = Object.fromEntries(baseNavItems.map((item) => [item.key, item.label]))
  tabLabels.create = '创建工单'
  tabLabels.detail = '工单详情'
  const activeTabLabel = tabLabels[tab] || 'MES-lite'
  const activeSystemTab = readableSystemNavItems.some((item) => item.key === tab)
  const baseMobileNavItems = navItems.slice(0, 4)
  const activeBusinessNavItem = navItems.find((item) => item.key === tab)
  const mobilePrimaryItems = activeBusinessNavItem && !baseMobileNavItems.some((item) => item.key === activeBusinessNavItem.key)
    ? [...baseMobileNavItems.slice(0, 3), activeBusinessNavItem]
    : baseMobileNavItems

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
    if (!systemMenuOpen) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const menu = systemMenuRef.current
      if (!menu || menu.contains(event.target as Node)) return
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

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 5000)
  }

  useEffect(() => {
    if (tab === 'dashboard') fetchDashboard()
    if (tab === 'orders') fetchOrders()
    if (tab === 'stocks') {
      fetchStocks()
      fetchCustomers()
    }
    if (tab === 'create') {
      fetchProducts()
      fetchMaterialOptions()
    }
  }, [tab, selectedOrderStatuses, selectedStockCategories, stockCustomerFilter, showInvalidStocks])

  const fetchOrders = async () => {
    const query = getStatusQuery(selectedOrderStatuses, orderStatusOptions)
    const url = query ? `/api/orders?${query}` : '/api/orders'
    const res = await fetch(url)
    const data = await res.json()
    setOrders(data.data || [])
  }

  const fetchStocks = async () => {
    const params = new URLSearchParams()
    if (stockCustomerFilter) params.set('customerId', stockCustomerFilter)
    const categoryQuery = getMultiSelectQuery('categories', selectedStockCategories, materialCategoryFilterOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    if (showInvalidStocks) params.set('includeInvalid', '1')
    const res = await fetch(`/api/stocks${params.toString() ? `?${params.toString()}` : ''}`)
    const data = await res.json()
    if (!res.ok) {
      setStocks([])
      setStockDataError({ message: data.error || '库存数据异常', issues: data.issues || [] })
      showMessage(data.error || '库存数据异常')
      return
    }
    setStockDataError(null)
    setStocks(data.data || [])
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

  const handleStockCategoryChange = (next: string[]) => {
    setSelectedStockCategories(next)
    if (next.length !== materialCategoryFilterOptions.length) {
      setStockFilter('material')
    }
  }

  const openStockAdjust = (stock: Stock) => {
    setAdjustingStock(stock)
    setStockAdjustForm({
      newQty: Number(stock.qty || 0),
      newValuationQty: Number(stock.valuationQty || 0),
      newTotalCost: Number(stock.totalCost || 0),
      reason: '',
    })
  }

  const submitStockAdjust = async () => {
    if (!adjustingStock) return
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
          newQty: Number(stockAdjustForm.newQty),
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

  const fetchProducts = async () => {
    const res = await fetch('/api/products')
    if (res.ok) {
      const data = await res.json()
      setProducts(data.data || [])
    }
  }

  const fetchMaterialOptions = async () => {
    const res = await fetch('/api/materials?pageSize=200')
    if (res.ok) {
      const data = await res.json()
      setMaterialOptions(data.data || [])
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
    const targetId = orderTargetType === 'PRODUCT' ? selectedProductId : selectedMaterialId
    if (!targetId || planQty <= 0) {
      showMessage(`请选择${orderTargetType === 'PRODUCT' ? '产品' : '物料'}并输入有效数量`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: orderTargetType, targetId, planQty, voucherNo: orderVoucherNo || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(`工单创建成功：${data.data.orderNo}`)
        setPlanQty(100)
        setOrderVoucherNo('')
        setSelectedProductId('')
        setSelectedMaterialId('')
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

  const confirmOrder = async (orderId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        showMessage(data.message)
        await fetchOrders()
      } else {
        showMessage(data.error || '确认失败')
      }
    } catch (err) {
      showMessage('确认失败')
    }
    setLoading(false)
  }

  const handleSelectOrder = (order: Order) => {
    fetchOrderDetail(order.id)
    setTab('detail')
  }

  const dashboardView = {
    todayOrderCount: dashboard?.todayOrderCount ?? dashboard?.todayOrders ?? 0,
    monthOrderCount: dashboard?.monthOrderCount ?? dashboard?.monthOrders ?? 0,
    todayProduction: dashboard?.todayProduction ?? 0,
    monthProduction: dashboard?.monthProduction ?? 0,
    pendingMaterialInCount: dashboard?.pendingMaterialInCount ?? dashboard?.pendingMaterialIns ?? 0,
    pendingShipmentCount: dashboard?.pendingShipmentCount ?? dashboard?.pendingShipments ?? 0,
    pendingReturnCount: dashboard?.pendingReturnCount ?? dashboard?.pendingReturns ?? 0,
    lowStocks: dashboard?.lowStocks ?? dashboard?.alertStocks ?? [],
    statusDistribution: dashboard?.statusDistribution ?? dashboard?.orderStatusDist ?? [],
  }
  const dashboardMetricItems = [
    { label: '今日工单', value: dashboardView.todayOrderCount, tone: 'blue', hint: '新建' },
    { label: '本月工单', value: dashboardView.monthOrderCount, tone: 'indigo', hint: '累计' },
    { label: '今日产量', value: dashboardView.todayProduction, tone: 'green', hint: '完工' },
    { label: '本月产量', value: dashboardView.monthProduction, tone: 'emerald', hint: '累计' },
    { label: '待收货', value: dashboardView.pendingMaterialInCount, tone: 'yellow', hint: '来料' },
    { label: '待发货', value: dashboardView.pendingShipmentCount, tone: 'orange', hint: '出库' },
    { label: '退货待处理', value: dashboardView.pendingReturnCount, tone: 'red', hint: '售后' },
    { label: '库存预警', value: dashboardView.lowStocks.length, tone: 'pink', hint: '低库存' },
  ]
  const dashboardWorkloadItems = [
    { label: '今日工单', value: dashboardView.todayOrderCount, tone: 'blue' },
    { label: '本月工单', value: dashboardView.monthOrderCount, tone: 'indigo' },
    { label: '今日产量', value: dashboardView.todayProduction, tone: 'green' },
    { label: '本月产量', value: dashboardView.monthProduction, tone: 'emerald' },
  ]
  const dashboardPendingItems = [
    { label: '待收货', value: dashboardView.pendingMaterialInCount, tone: 'yellow', hint: '原材料入库' },
    { label: '待发货', value: dashboardView.pendingShipmentCount, tone: 'orange', hint: '成品出库' },
    { label: '退货待处理', value: dashboardView.pendingReturnCount, tone: 'red', hint: '售后返库' },
    { label: '库存预警', value: dashboardView.lowStocks.length, tone: 'pink', hint: '低于阈值' },
  ]
  const visibleStocks = stocks.filter((stock) => (
    stockFilter === 'all' ? true : stockFilter === 'material' ? !!stock.material : !!stock.product
  ))

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-56 flex-col bg-white shadow-sm lg:flex">
        <div className="p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">MES-lite</h1>
              <p className="text-xs text-gray-500">生产系统 · v{appVersion}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {navItems.map((item, index) => (
            <button
              key={item.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => {
                setTab(item.key)
                setSystemMenuOpen(false)
              }}
              className={`w-full px-4 py-3 rounded-lg text-sm font-medium transition flex items-center justify-between cursor-grab ${
                draggedIndex === index ? 'opacity-50 bg-gray-200' :
                dragOverIndex === index ? 'ring-2 ring-blue-400 bg-blue-50' :
                tab === item.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <MenuIcon icon={item.key} />
                {item.label}
              </div>
              <span className="text-gray-400 text-sm opacity-0 hover:opacity-100 transition">⋮⋮</span>
            </button>
          ))}
        </nav>
        <div className="shrink-0 p-4 border-t bg-white space-y-3">
          <div className="mb-3 px-3 py-2 border border-gray-200 rounded-lg">
            <OperatorBadge operator={operator} />
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-3 pb-28 sm:p-4 lg:ml-56 lg:p-6">
        <div className="sticky top-0 z-30 -mx-3 mb-3 border-b border-gray-200 bg-gray-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:mb-4 sm:px-4 lg:-mx-6 lg:px-6">
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <div className="hidden min-w-0 shrink-0 pt-1 sm:block">
              <div className="hidden text-xs font-medium text-gray-400 sm:block">{activeSystemTab ? '系统功能' : '业务功能'}</div>
              <div className="max-w-[7rem] truncate text-sm font-semibold text-gray-900 sm:max-w-[10rem] sm:text-lg lg:max-w-[12rem]">{activeTabLabel}</div>
            </div>
            <div id="topbar-actions" className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-visible">
                {tab === 'orders' ? (
                  <ResponsiveToolbarActions
                    filters={(
                      <StatusCheckboxFilter
                        options={orderStatusOptions}
                        value={selectedOrderStatuses}
                        onChange={setSelectedOrderStatuses}
                        storageKey="mes-lite.filters.orders.status.order"
                      />
                    )}
                    actions={(
                      <>
                        <div className="hidden sm:block">
                          <ViewModeToggle value={orderViewMode} onChange={setOrderViewMode} />
                        </div>
                        {canCreate('orders') && (
                          <button
                            onClick={() => setTab('create')}
                            className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition sm:px-4 sm:py-2 sm:text-sm"
                          >
                            新增
                          </button>
                        )}
                      </>
                    )}
                  />
                ) : tab === 'stocks' ? (
                  <ResponsiveToolbarActions
                    filters={(
                      <>
                        <select
                          value={stockCustomerFilter}
                          onChange={(e) => setStockCustomerFilter(e.target.value)}
                          className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="">全部客户</option>
                          <option value="__UNASSIGNED__">通用/未绑定</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
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
                    actions={(
                      <>
                        <div className="hidden sm:block">
                          <ViewModeToggle value={stockViewMode} onChange={setStockViewMode} />
                        </div>
                        <button
                          onClick={() => setShowStockHelp(true)}
                          className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-xs hover:bg-blue-50 sm:px-4 sm:py-2 sm:text-sm"
                        >
                          调整
                        </button>
                      </>
                    )}
                  />
                ) : null}
            </div>
            <div ref={systemMenuRef} className="relative shrink-0">
              <button
                onClick={() => setSystemMenuOpen((open) => !open)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
              >
                <span className="hidden max-w-32 truncate sm:inline">{operator.name}</span>
                <span className="sm:hidden">我</span>
                <span className="text-gray-400">▾</span>
              </button>
              {systemMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <OperatorBadge operator={operator} />
                    <div className="mt-1 text-xs font-medium text-gray-400">MES-lite v{appVersion}</div>
                  </div>
                  <div className="p-2">
                    {readableSystemNavItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => {
                          setTab(item.key)
                          setSystemMenuOpen(false)
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                          tab === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <MenuIcon icon={item.key} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 p-2">
                    <button
                      onClick={() => {
                        setSystemMenuOpen(false)
                        onLogout()
                      }}
                      className="flex w-full items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-4 rounded-lg text-sm ${
            message.includes('成功') || message.includes('完成') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* 仪表盘 */}
        {tab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            <DashboardKpiGrid items={dashboardMetricItems} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <DashboardBarPanel title="生产负荷" items={dashboardWorkloadItems} />
              <DashboardSignalGrid
                title="待处理事项"
                items={dashboardPendingItems}
              />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <OrderStatusDonut items={dashboardView.statusDistribution} />
              <StockAlertList stocks={dashboardView.lowStocks} />
            </div>
          </div>
        )}

        {tab === 'dashboard' && !dashboard && (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        )}

        {/* 工单管理 */}
        {tab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-3 sm:p-6">
            {orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500 sm:py-12">
                <p className="mb-4">暂无工单</p>
                {canCreate('orders') && (
                  <button
                    onClick={() => setTab('create')}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition sm:px-4 sm:py-2"
                  >
                    新增工单
                  </button>
                )}
              </div>
            ) : effectiveOrderViewMode === 'card' ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm sm:p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold text-blue-700">{order.orderNo}</div>
                        <div className="mt-1 text-xs text-gray-500">凭据号：{order.voucherNo || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>
                    <div className="mt-3 sm:mt-4">
                      <div className="text-xs text-gray-500">目标</div>
                      <div className="mt-1 font-semibold text-gray-900">{order.targetMaterial?.name || order.product.name}</div>
                      <div className="text-xs text-gray-500">
                        {order.targetMaterial ? `物料 ${order.targetMaterial.code}` : `产品 ${order.product.sku}`}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:mt-4 sm:gap-3">
                      <div className="rounded bg-gray-50 p-2 sm:p-3">
                        <div className="text-xs text-gray-500">计划</div>
                        <div className="mt-1 font-semibold">{order.planQty}</div>
                      </div>
                      <div className="rounded bg-gray-50 p-2 sm:p-3">
                        <div className="text-xs text-gray-500">完成</div>
                        <div className="mt-1 font-semibold text-green-700">{order.completeQty}</div>
                      </div>
                      <div className="rounded bg-gray-50 p-2 sm:p-3">
                        <div className="text-xs text-gray-500">报废</div>
                        <div className="mt-1 font-semibold text-red-600">{order.scrapQty}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 sm:mt-4">
                      <span>报工 {order._count.reports} · 领料 {order._count.picks}</span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={order.id} compact onMessage={showMessage} />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      {order.status === 'DRAFT' ? (
                        <button onClick={(e) => { e.stopPropagation(); confirmOrder(order.id) }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">确认</button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleSelectOrder(order) }} className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">详情</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单号</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">凭据号</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">目标</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">计划</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">完成/报废</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">时间</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectOrder(order)}>
                        <td className="px-4 py-3 font-mono text-blue-600 text-sm">{order.orderNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{order.voucherNo || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{order.targetMaterial?.name || order.product.name}</div>
                          <div className="text-xs text-gray-500">
                            {order.targetMaterial ? `物料 ${order.targetMaterial.code}` : `产品 ${order.product.sku}`}
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
                          {order.status === 'DRAFT' && (
                            <button onClick={(e) => { e.stopPropagation(); confirmOrder(order.id) }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">确认</button>
                          )}
                          {order.status !== 'DRAFT' && (
                            <button onClick={(e) => { e.stopPropagation(); handleSelectOrder(order) }} className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">详情</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 工单详情 */}
        {tab === 'detail' && orderDetail && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">工单详情</h2>
                <p className="text-sm text-gray-500">{orderDetail.orderNo}</p>
                <p className="text-sm text-gray-500">凭据号：{orderDetail.voucherNo || '-'}</p>
              </div>
              <button onClick={() => setTab('orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">返回列表</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">目标</div>
                <div className="font-medium">{orderDetail.targetMaterial?.name || orderDetail.product.name}</div>
                <div className="text-xs text-gray-400">
                  {orderDetail.targetMaterial ? `物料 ${orderDetail.targetMaterial.code}` : `产品 ${orderDetail.product.sku}`}
                </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-4">领料项</h3>
                <div className="space-y-2">
                  {orderDetail.picks?.length === 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">无领料项</div>
                  )}
                  {orderDetail.picks?.map((pick: PickItem) => (
                    <div key={pick.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium text-sm">{pick.material.name}</div>
                          <div className="text-xs text-gray-500">{pick.material.code}</div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${statusColors[pick.status]}`}>{statusLabels[pick.status]}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>需求：{pick.requiredQty} {pick.material.unit}</span>
                        <span>已领：{pick.actualQty} {pick.material.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-4">工艺路线</h3>
                <div className="space-y-2">
                  {orderDetail.routeSteps?.length === 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">无工艺路线</div>
                  )}
                  {orderDetail.routeSteps?.map((step: ProcessStep) => (
                    <div key={step.id} className={`border rounded-lg p-3 ${step.id === orderDetail.currentStepId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step.id === orderDetail.currentStepId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{step.stepNo}</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{step.name}</div>
                          {step.workstation && <div className="text-xs text-gray-500">工作中心：{step.workstation}</div>}
                        </div>
                        {step.id === orderDetail.currentStepId && <span className="text-xs text-blue-600 font-medium">当前工序</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <AttachmentPanel
                ownerType="PRODUCTION_ORDER"
                ownerId={orderDetail.id}
                title="工单原始单据"
                onMessage={showMessage}
              />
            </div>
          </div>
        )}

        {/* 创建工单 */}
        {tab === 'create' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
            <h2 className="text-xl font-semibold mb-6">创建工单</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">工单模式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderTargetType('PRODUCT')}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition ${
                      orderTargetType === 'PRODUCT' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    标准产品工单
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderTargetType('MATERIAL')}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition ${
                      orderTargetType === 'MATERIAL' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    简易物料工单
                  </button>
                </div>
              </div>
              {orderTargetType === 'PRODUCT' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">选择产品</label>
                  <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg">
                    <option value="">请选择产品</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">选择物料</label>
                  <select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg">
                    <option value="">请选择物料</option>
                    {materialOptions.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name} ({material.code}) · {materialCategoryLabels[material.category] || material.category}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">计划产量</label>
                <input type="number" value={planQty} onChange={(e) => setPlanQty(Number(e.target.value))} min={1} className="w-full px-4 py-3 border border-gray-200 rounded-lg" />
              </div>
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
              <button onClick={createOrder} disabled={loading} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? '创建中...' : '创建工单'}
              </button>
            </div>
          </div>
        )}

        {/* 库存管理 */}
        {tab === 'stocks' && (
          <div className="bg-white rounded-lg shadow p-3 sm:p-6">
            {stockDataError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="font-semibold">{stockDataError.message}</div>
                <div className="mt-1 text-xs text-red-700">库存页已停止展示可能不完整的数据，请先处理以下一致性问题。</div>
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
            {effectiveStockViewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存对象</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">客户</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">类型</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">已预留</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">可用</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">核算库存</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存金额</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleStocks.map((stock) => (
                      <tr key={stock.id} className="hover:bg-gray-50">
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
                        <td className="px-4 py-3 text-sm">{stock.qty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className="px-4 py-3 text-sm text-orange-600">{stock.reservedQty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className={`px-4 py-3 text-sm font-medium ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty} {stock.material?.stockUnit || stock.product?.unit}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleStocks.map((stock) => (
                  <div key={stock.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
	                  <div className="flex items-start justify-between mb-3">
	                    <div>
	                      <div className="font-medium text-gray-800">{stock.material?.name || stock.product?.name}</div>
	                      <div className="text-sm text-gray-500">{stock.material?.code || stock.product?.sku}</div>
	                      <div className="text-xs text-gray-400">
	                        客户：{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}
	                      </div>
	                      {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
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
                      <div className="text-lg font-semibold">{stock.qty}</div>
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
                  {stock.material && (
                    <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                      <div>核算库存：<span className="font-semibold text-gray-900">{stock.valuationQty}</span> {stock.material.valuationUnit}</div>
                      <div className="mt-1">库存金额：<span className="font-semibold text-gray-900">¥{Number(stock.totalCost || 0).toFixed(2)}</span></div>
                      <div className="mt-1">
                        成本：¥{Number(stock.valuationUnitCost || 0).toFixed(4)} / {stock.material.valuationUnit}
                        <span className="ml-2">¥{Number(stock.stockUnitCost || 0).toFixed(4)} / {stock.material.stockUnit || stock.material.unit}</span>
                      </div>
                      <div className="mt-1">换算：1 {stock.material.stockUnit || stock.material.unit} = {stock.material.conversionRate || 1} {stock.material.valuationUnit}</div>
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
              ))}
              </div>
            )}
            {visibleStocks.length === 0 && (
              <div className="py-12 text-center text-gray-500">暂无库存记录</div>
            )}
          </div>
        )}

        {adjustingStock && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">存货调整</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {adjustingStock.material?.name || adjustingStock.product?.name} · {adjustingStock.material?.code || adjustingStock.product?.sku}
                  </p>
                </div>
                <button onClick={() => setAdjustingStock(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  用于期初录入、盘点差异、损耗和早期数据尾差修正。来料单整单冲销仍使用“红冲”。
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      调整后库存 {adjustingStock.material ? `(${adjustingStock.material.stockUnit || adjustingStock.material.unit})` : `(${adjustingStock.product?.unit || ''})`}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={stockAdjustForm.newQty || ''}
                      onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newQty: Number(e.target.value) })}
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
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={submitStockAdjust}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? '提交中...' : '确认调整'}
                  </button>
                  <button
                    onClick={() => setAdjustingStock(null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showStockHelp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">存货调整</h3>
                <button onClick={() => setShowStockHelp(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                  ×
                </button>
              </div>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
                  先建立物料，系统会自动生成 0 库存记录；再回到库存页，在对应库存卡片中点击“存货调整”，填写调整后数量、核算重量、库存金额和原因。
                </div>
                <p>存货调整统一覆盖期初录入、盘点差异、损耗、早期数据尾差和初始化库存。所有调整都会写入操作日志，不做物理删除。</p>
                <p>已经有来料单、领料、红冲等业务单据时，优先使用对应业务单据；存货调整只处理非单据型差异。</p>
              </div>
              <div className="mt-5 flex justify-end">
                <button onClick={() => setShowStockHelp(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 物料管理 */}
        {tab === 'materials' && <MaterialPage onMessage={showMessage} />}

        {/* 作业指导书 */}
        {tab === 'workInstructions' && <WorkInstructionPage onMessage={showMessage} />}

        {/* 来料管理 */}
        {tab === 'materialIn' && <MaterialInPage onMessage={showMessage} />}

        {/* 派工管理 */}
        {tab === 'dispatch' && (
          <DispatchPage
            onMessage={showMessage}
          />
        )}

        {/* 发货管理 */}
        {tab === 'shipment' && <ShipmentPage onMessage={showMessage} />}

        {/* 退货管理 */}
        {tab === 'return' && <ReturnPage onMessage={showMessage} />}

        {/* 统计分析 */}
        {tab === 'stats' && <StatsPage onMessage={showMessage} />}

        {/* 人员管理 */}
        {tab === 'operators' && <OperatorPage currentOperator={operator} onMessage={showMessage} />}

        {/* 系统管理 */}
        {tab === 'system' && <SystemPage onMessage={showMessage} />}

        {/* 人员权限控制 */}
        {tab === 'permissionUsers' && <PermissionPage mode="users" onMessage={showMessage} />}

        {/* 组权限控制 */}
        {tab === 'permissionGroups' && <PermissionPage mode="groups" onMessage={showMessage} />}
      </main>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-[5.25rem] max-h-[68vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">全部功能</div>
                <div className="text-xs text-gray-500">上下移动可调整底部常用入口</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md border border-gray-200 px-2.5 py-1 text-sm text-gray-600"
              >
                关闭
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {navItems.map((item, index) => (
                <div key={item.key} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTab(item.key)
                      setMobileNavOpen(false)
                      setSystemMenuOpen(false)
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-medium ${
                      tab === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <MenuIcon icon={item.key} />
                    <span className="truncate">{item.label}</span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`${item.label} 上移`}
                      disabled={index === 0}
                      onClick={() => moveNavItem(item.key, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-sm text-gray-600 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.label} 下移`}
                      disabled={index === navItems.length - 1}
                      onClick={() => moveNavItem(item.key, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-sm text-gray-600 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {mobilePrimaryItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key)
                setMobileNavOpen(false)
                setSystemMenuOpen(false)
              }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                tab === item.key ? 'bg-blue-600 text-white shadow-sm [&_span:first-child]:bg-white/15 [&_span:first-child]:text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <MenuIcon icon={item.key} />
              <span className="max-w-full truncate">{compactNavLabel(item.label)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
              mobileNavOpen ? 'bg-gray-900 text-white [&_span:first-child]:bg-white/15 [&_span:first-child]:text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[13px] font-semibold text-slate-700">多</span>
            <span>更多</span>
          </button>
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

function OrderStatusDonut({ items }: { items: { status: string; count: number }[] }) {
  const palette: Record<string, string> = {
    DRAFT: '#94a3b8',
    CONFIRMED: '#3b82f6',
    PICKED: '#eab308',
    RUNNING: '#f97316',
    QC_WAITING: '#a855f7',
    QC_DONE: '#6366f1',
    COMPLETED: '#22c55e',
    CANCELLED: '#ef4444',
  }
  const normalizedItems = [...items].sort((a, b) => (b.count || 0) - (a.count || 0))
  const total = normalizedItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0)

  let cursor = 0
  const segments = normalizedItems.map((item) => {
    const share = total > 0 ? (Number(item.count) / total) * 100 : 0
    const start = cursor
    const end = cursor + share
    cursor = end
    return {
      ...item,
      start,
      end,
      color: palette[item.status] || '#64748b',
    }
  })
  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})`
    : 'conic-gradient(#e5e7eb 0% 100%)'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">工单状态分布</h3>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">合计 {total}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-6 items-center">
        <div className="flex justify-center">
          <div
            className="relative h-40 w-40 rounded-full shadow-inner"
            style={{ background: gradient }}
          >
            <div className="absolute inset-5 rounded-full bg-white shadow-sm flex flex-col items-center justify-center">
              <div className="text-3xl font-semibold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500">总工单</div>
            </div>
          </div>
        </div>
        {segments.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
            暂无工单状态数据
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((item) => (
              <div key={item.status}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate font-medium text-gray-700">{statusLabels[item.status] || item.status}</span>
                  </div>
                  <div className="shrink-0 font-semibold text-gray-950">{item.count}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${total > 0 ? Math.max(4, (Number(item.count) / total) * 100) : 0}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-gray-500">
                    {total > 0 ? `${((Number(item.count) / total) * 100).toFixed(0)}%` : '0%'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
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
