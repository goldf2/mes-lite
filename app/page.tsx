'use client'

import { useState, useEffect } from 'react'
import MaterialInPage from './components/MaterialInPage'
import DispatchPage from './components/DispatchPage'
import ShipmentPage from './components/ShipmentPage'
import ReturnPage from './components/ReturnPage'
import StatsPage from './components/StatsPage'
import MaterialPage from './components/MaterialPage'
import AttachmentPanel from './components/AttachmentPanel'
import AuthGate, { CurrentOperator, OperatorBadge } from './components/AuthGate'
import OperatorPage from './components/OperatorPage'
import SystemPage from './components/SystemPage'
import PermissionPage from './components/PermissionPage'
import StatusCheckboxFilter, { getStatusQuery } from './components/StatusCheckboxFilter'
import ResponsiveToolbarActions from './components/ResponsiveToolbarActions'

// ==================== 类型定义 ====================

interface Product {
  id: string
  sku: string
  name: string
  category: string
  unit: string
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
  material?: { id: string; code: string; name: string; spec: string; category?: string; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number; deletedAt?: string | null }
  product?: { id: string; sku: string; name: string; category: string; unit: string }
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

interface Order {
  id: string
  orderNo: string
  status: string
  planQty: number
  completeQty: number
  scrapQty: number
  createdAt: string
  product: { id: string; name: string; sku: string }
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

type TabType = 'dashboard' | 'orders' | 'materials' | 'materialIn' | 'dispatch' | 'stocks' | 'shipment' | 'return' | 'stats' | 'operators' | 'system' | 'permissionUsers' | 'permissionGroups' | 'permissions' | 'create' | 'detail'

// ==================== 菜单图标组件 ====================

function MenuIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    dashboard: '📊',
    orders: '📋',
    materials: '📦',
    materialIn: '📥',
    dispatch: '🔄',
    stocks: '🏭',
    shipment: '📤',
    return: '📧',
    stats: '📈',
    operators: '👤',
    system: '⚙️',
    permissionUsers: '👥',
    permissionGroups: '🧩',
    permissions: '🔐',
  }
  return <span className="text-lg">{icons[icon] || '📄'}</span>
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
    { key: 'orders', label: '工单管理', resource: 'orders' },
    { key: 'materials', label: '物料管理', resource: 'materials' },
    { key: 'materialIn', label: '来料管理', resource: 'materialIn' },
    { key: 'dispatch', label: '派工管理', resource: 'dispatch' },
    { key: 'stocks', label: '库存管理', resource: 'stocks' },
    { key: 'shipment', label: '发货管理', resource: 'shipment' },
    { key: 'return', label: '退货管理', resource: 'return' },
    { key: 'stats', label: '统计分析', resource: 'stats' },
    { key: 'operators', label: '人员管理', resource: 'operators' },
    { key: 'system', label: '系统管理', resource: 'system' },
    { key: 'permissionUsers', label: '人员权限', resource: 'permissionUsers' },
    { key: 'permissionGroups', label: '组权限', resource: 'permissionGroups' },
  ]
  const systemResources = new Set(['operators', 'system', 'permissionUsers', 'permissionGroups', 'permissions'])
  const readableBusinessNavItems = baseNavItems.filter((item) => canRead(item.resource) && !systemResources.has(item.resource))
  const readableSystemNavItems = baseNavItems.filter((item) => canRead(item.resource) && systemResources.has(item.resource))
  const [tab, setTab] = useState<TabType>('dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [planQty, setPlanQty] = useState(100)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState(orderStatusOptions.map((option) => option.value))
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockCategoryFilter, setStockCategoryFilter] = useState('')
  const [showInvalidStocks, setShowInvalidStocks] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [topBarActions, setTopBarActions] = useState<React.ReactNode>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState({
    newQty: 0,
    newValuationQty: 0,
    newTotalCost: 0,
    reason: '',
  })

  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>(readableBusinessNavItems)
  const tabLabels: Record<string, string> = Object.fromEntries(baseNavItems.map((item) => [item.key, item.label]))
  tabLabels.create = '创建工单'
  tabLabels.detail = '工单详情'
  const activeTabLabel = tabLabels[tab] || 'MES-lite'
  const activeSystemTab = readableSystemNavItems.some((item) => item.key === tab)

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

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 5000)
  }

  useEffect(() => {
    if (tab === 'dashboard') fetchDashboard()
    if (tab === 'orders') fetchOrders()
    if (tab === 'stocks') fetchStocks()
    if (tab === 'create') fetchProducts()
    setTopBarActions(null)
  }, [tab, selectedOrderStatuses, stockCategoryFilter, showInvalidStocks])

  const fetchOrders = async () => {
    const query = getStatusQuery(selectedOrderStatuses, orderStatusOptions)
    const url = query ? `/api/orders?${query}` : '/api/orders'
    const res = await fetch(url)
    const data = await res.json()
    setOrders(data.data || [])
  }

  const fetchStocks = async () => {
    const params = new URLSearchParams()
    if (stockCategoryFilter) params.set('category', stockCategoryFilter)
    if (showInvalidStocks) params.set('includeInvalid', '1')
    const res = await fetch(`/api/stocks${params.toString() ? `?${params.toString()}` : ''}`)
    const data = await res.json()
    setStocks(data.data || [])
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
      showMessage('请输入库存调整原因')
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
        showMessage(data.message || '库存调整完成')
        setAdjustingStock(null)
        await fetchStocks()
        await fetchDashboard()
      } else {
        showMessage(data.error || '库存调整失败')
      }
    } catch (err) {
      showMessage('库存调整失败')
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
    if (!selectedProductId || planQty <= 0) {
      showMessage('请选择产品并输入有效数量')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId, planQty }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(`工单创建成功：${data.data.orderNo}`)
        setPlanQty(100)
        setSelectedProductId('')
        await fetchOrders()
        await fetchStocks()
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-white shadow-sm fixed left-0 top-0 h-screen z-20 flex flex-col">
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
          {canCreate('orders') && (
            <button
              onClick={() => {
                setTab('create')
                setSystemMenuOpen(false)
              }}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
              <span>+</span> 创建工单
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 ml-56 p-6">
        <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-400">{activeSystemTab ? '系统功能' : '业务功能'}</div>
              <div className="truncate text-lg font-semibold text-gray-900">{activeTabLabel}</div>
            </div>
            <div className="flex min-w-[320px] flex-1 items-center justify-end gap-2">
              {topBarActions || (tab === 'orders' ? (
                <ResponsiveToolbarActions>
                  <StatusCheckboxFilter
                    options={orderStatusOptions}
                    value={selectedOrderStatuses}
                    onChange={setSelectedOrderStatuses}
                  />
                </ResponsiveToolbarActions>
              ) : canCreate('orders') && tab !== 'create' && (
                <button
                  onClick={() => {
                    setTab('create')
                    setSystemMenuOpen(false)
                  }}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  + 创建工单
                </button>
              ))}
            </div>
            <div className="relative shrink-0">
              <button
                onClick={() => setSystemMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span className="max-w-32 truncate">{operator.name}</span>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="今日新增工单" value={dashboardView.todayOrderCount} color="blue" />
              <StatCard label="本月工单" value={dashboardView.monthOrderCount} color="indigo" />
              <StatCard label="今日产量" value={dashboardView.todayProduction} color="green" />
              <StatCard label="本月产量" value={dashboardView.monthProduction} color="emerald" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="待收货" value={dashboardView.pendingMaterialInCount} color="yellow" />
              <StatCard label="待发货" value={dashboardView.pendingShipmentCount} color="orange" />
              <StatCard label="待处理退货" value={dashboardView.pendingReturnCount} color="red" />
              <StatCard label="库存预警" value={dashboardView.lowStocks.length} color="pink" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <DashboardSignalGrid
                title="待处理事项"
                items={[
                  { label: '待收货', value: dashboardView.pendingMaterialInCount, tone: 'yellow', hint: '原材料入库' },
                  { label: '待发货', value: dashboardView.pendingShipmentCount, tone: 'orange', hint: '成品出库' },
                  { label: '待处理退货', value: dashboardView.pendingReturnCount, tone: 'red', hint: '售后返库' },
                  { label: '库存预警', value: dashboardView.lowStocks.length, tone: 'pink', hint: '低于阈值' },
                ]}
              />
              <OrderStatusDonut items={dashboardView.statusDistribution} />
            </div>
            <StockAlertList stocks={dashboardView.lowStocks} />
          </div>
        )}

        {tab === 'dashboard' && !dashboard && (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        )}

        {/* 工单管理 */}
        {tab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-6">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无工单</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单号</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">计划</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">完成/报废</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">时间</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectOrder(order)}>
                        <td className="px-4 py-3 font-mono text-blue-600 text-sm">{order.orderNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{order.product.name}</div>
                          <div className="text-xs text-gray-500">{order.product.sku}</div>
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
                        <td className="px-4 py-3">
                          {order.status === 'DRAFT' && (
                            <button onClick={(e) => { e.stopPropagation(); confirmOrder(order.id) }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">确认</button>
                          )}
                          {order.status !== 'DRAFT' && (
                            <button onClick={(e) => e.stopPropagation()} className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">详情</button>
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
              </div>
              <button onClick={() => setTab('orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">返回列表</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">产品</div>
                <div className="font-medium">{orderDetail.product.name}</div>
                <div className="text-xs text-gray-400">{orderDetail.product.sku}</div>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">选择产品</label>
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg">
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">计划产量</label>
                <input type="number" value={planQty} onChange={(e) => setPlanQty(Number(e.target.value))} min={1} className="w-full px-4 py-3 border border-gray-200 rounded-lg" />
              </div>
              <button onClick={createOrder} disabled={loading} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? '创建中...' : '创建工单'}
              </button>
            </div>
          </div>
        )}

        {/* 库存管理 */}
        {tab === 'stocks' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">库存查询</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {([['all', '全部'], ['material', '物料'], ['product', '成品']] as const).map(([key, label]) => (
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
                <select
                  value={stockCategoryFilter}
                  onChange={(e) => {
                    setStockCategoryFilter(e.target.value)
                    if (e.target.value) setStockFilter('material')
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">全部物料分类</option>
                  {materialCategoryOptions.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={showInvalidStocks}
                    onChange={(e) => setShowInvalidStocks(e.target.checked)}
                  />
                  显示归档无库存
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks
                .filter((s) => stockFilter === 'all' ? true : stockFilter === 'material' ? !!s.material : !!s.product)
                .map((stock) => (
                <div key={stock.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800">{stock.material?.name || stock.product?.name}</div>
                      <div className="text-sm text-gray-500">{stock.material?.code || stock.product?.sku}</div>
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
                      库存调整
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {adjustingStock && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">库存调整</h3>
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
                  用于盘点、损耗、早期数据尾差修正。来料单整单冲销仍使用“红冲”。
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
                    placeholder="例如：早期数据成本尾差调整、盘点损耗、称重误差"
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

        {/* 物料管理 */}
        {tab === 'materials' && <MaterialPage onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 来料管理 */}
        {tab === 'materialIn' && <MaterialInPage onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 派工管理 */}
        {tab === 'dispatch' && <DispatchPage onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 发货管理 */}
        {tab === 'shipment' && <ShipmentPage onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 退货管理 */}
        {tab === 'return' && <ReturnPage onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 统计分析 */}
        {tab === 'stats' && <StatsPage onMessage={showMessage} />}

        {/* 人员管理 */}
        {tab === 'operators' && <OperatorPage currentOperator={operator} onMessage={showMessage} onToolbarChange={setTopBarActions} />}

        {/* 系统管理 */}
        {tab === 'system' && <SystemPage onMessage={showMessage} />}

        {/* 人员权限控制 */}
        {tab === 'permissionUsers' && <PermissionPage mode="users" onMessage={showMessage} />}

        {/* 组权限控制 */}
        {tab === 'permissionGroups' && <PermissionPage mode="groups" onMessage={showMessage} />}
      </main>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    pink: 'border-pink-200 bg-pink-50 text-pink-700',
  }
  return (
    <div className={`border rounded-lg p-4 ${colorMap[color] || 'border-gray-200 bg-gray-50'}`}>
      <div className="text-sm mb-1 opacity-80">{label}</div>
      <div className="text-2xl font-bold">{value ?? 0}</div>
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
  const toneMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    pink: 'bg-pink-50 text-pink-700 border-pink-100',
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-gray-400">实时状态</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl border p-4 ${toneMap[item.tone] || 'bg-gray-50 text-gray-700 border-gray-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="mt-1 text-xs opacity-70">{item.hint}</div>
              </div>
              <div className="text-3xl font-semibold leading-none">{item.value ?? 0}</div>
            </div>
          </div>
        ))}
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-800">工单状态分布</h3>
        <span className="text-xs text-gray-400">合计 {total}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-6 items-center">
        <div className="flex justify-center">
          <div
            className="relative h-40 w-40 rounded-full"
            style={{ background: gradient }}
          >
            <div className="absolute inset-6 rounded-full bg-white shadow-inner flex flex-col items-center justify-center">
              <div className="text-3xl font-semibold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500">工单总量</div>
            </div>
          </div>
        </div>
        {segments.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
            暂无工单状态数据
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {segments.map((item) => (
              <div key={item.status} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-700'}`}>
                    {statusLabels[item.status] || item.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{total > 0 ? `${((Number(item.count) / total) * 100).toFixed(1)}%` : '0%'}</span>
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-800">库存预警</h3>
        <span className="text-xs text-gray-400">低于 10</span>
      </div>
      {sortedStocks.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
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
              available <= 2 ? 'bg-red-100 text-red-700 border-red-200' :
              available <= 5 ? 'bg-orange-100 text-orange-700 border-orange-200' :
              'bg-yellow-100 text-yellow-700 border-yellow-200'

            return (
              <div key={stock.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
