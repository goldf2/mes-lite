'use client'

import { useState, useEffect } from 'react'
import MaterialInPage from './components/MaterialInPage'
import DispatchPage from './components/DispatchPage'
import ShipmentPage from './components/ShipmentPage'
import ReturnPage from './components/ReturnPage'
import StatsPage from './components/StatsPage'
import MaterialPage from './components/MaterialPage'

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
  material?: { id: string; code: string; name: string; spec: string; unit: string }
  product?: { id: string; sku: string; name: string; category: string; unit: string }
}

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

type TabType = 'dashboard' | 'orders' | 'materials' | 'materialIn' | 'dispatch' | 'stocks' | 'shipment' | 'return' | 'stats' | 'create' | 'detail'

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

// ==================== 主组件 ====================

export default function Home() {
  const [tab, setTab] = useState<TabType>('dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [planQty, setPlanQty] = useState(100)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>([
    { key: 'dashboard', label: '仪表盘' },
    { key: 'orders', label: '工单管理' },
    { key: 'materials', label: '物料管理' },
    { key: 'materialIn', label: '来料管理' },
    { key: 'dispatch', label: '派工管理' },
    { key: 'stocks', label: '库存管理' },
    { key: 'shipment', label: '发货管理' },
    { key: 'return', label: '退货管理' },
    { key: 'stats', label: '统计分析' },
  ])

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
  }, [tab, statusFilter])

  const fetchOrders = async () => {
    const url = statusFilter ? `/api/orders?status=${statusFilter}` : '/api/orders'
    const res = await fetch(url)
    const data = await res.json()
    setOrders(data.data || [])
  }

  const fetchStocks = async () => {
    const res = await fetch('/api/stocks')
    const data = await res.json()
    setStocks(data.data || [])
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-white shadow-sm fixed left-0 top-0 h-screen z-20">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">MES-lite</h1>
              <p className="text-xs text-gray-500">生产系统</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map((item, index) => (
            <button
              key={item.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => setTab(item.key)}
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
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={() => setTab('create')}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            <span>+</span> 创建工单
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-56 p-6">
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
              <StatCard label="今日新增工单" value={dashboard.todayOrders} color="blue" />
              <StatCard label="本月工单" value={dashboard.monthOrders} color="indigo" />
              <StatCard label="今日产量" value={dashboard.todayProduction} color="green" />
              <StatCard label="本月产量" value={dashboard.monthProduction} color="emerald" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="待收货" value={dashboard.pendingMaterialIns} color="yellow" />
              <StatCard label="待发货" value={dashboard.pendingShipments} color="orange" />
              <StatCard label="待处理退货" value={dashboard.pendingReturns} color="red" />
              <StatCard label="库存预警" value={dashboard.stockAlerts} color="pink" />
            </div>
            {dashboard.orderStatusDist && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">工单状态分布</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {dashboard.orderStatusDist.map((item: any) => (
                    <div key={item.status} className="border border-gray-200 rounded-lg p-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${statusColors[item.status] || 'bg-gray-100'}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                      <div className="text-2xl font-bold">{item.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dashboard.alertStocks && dashboard.alertStocks.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4 text-red-600">库存预警</h3>
                <div className="space-y-2">
                  {dashboard.alertStocks.map((stock: any) => (
                    <div key={stock.id} className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg p-3">
                      <span className="font-medium">{stock.material?.name || stock.product?.name}</span>
                      <span className="text-red-600">可用：{stock.availableQty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'dashboard' && !dashboard && (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        )}

        {/* 工单管理 */}
        {tab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">工单列表</h2>
              <div className="flex items-center gap-3">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">全部状态</option>
                  <option value="DRAFT">草稿</option>
                  <option value="CONFIRMED">已确认</option>
                  <option value="PICKED">已领料</option>
                  <option value="RUNNING">生产中</option>
                  <option value="QC_WAITING">待质检</option>
                  <option value="QC_DONE">质检完成</option>
                  <option value="COMPLETED">已完成</option>
                </select>
              </div>
            </div>
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
              <div className="flex gap-1">
                {([['all', '全部'], ['material', '原材料'], ['product', '成品']] as const).map(([key, label]) => (
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
                    <div className={`px-2 py-1 rounded text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {stock.material ? '原材料' : '成品'}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">库存</div>
                      <div className="text-lg font-semibold">{stock.qty}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">已预留</div>
                      <div className="text-lg font-semibold text-orange-600">{stock.reservedQty}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">可用</div>
                      <div className={`text-lg font-semibold ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 物料管理 */}
        {tab === 'materials' && <MaterialPage onMessage={showMessage} />}

        {/* 来料管理 */}
        {tab === 'materialIn' && <MaterialInPage onMessage={showMessage} />}

        {/* 派工管理 */}
        {tab === 'dispatch' && <DispatchPage onMessage={showMessage} />}

        {/* 发货管理 */}
        {tab === 'shipment' && <ShipmentPage onMessage={showMessage} />}

        {/* 退货管理 */}
        {tab === 'return' && <ReturnPage onMessage={showMessage} />}

        {/* 统计分析 */}
        {tab === 'stats' && <StatsPage onMessage={showMessage} />}
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
