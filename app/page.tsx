'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

type TabType = 'orders' | 'stocks' | 'create' | 'detail'

export default function Home() {
  const [tab, setTab] = useState<TabType>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [planQty, setPlanQty] = useState(100)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchOrders()
    fetchStocks()
    fetchProducts()
  }, [statusFilter])

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

  const fetchOrderDetail = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`)
    const data = await res.json()
    setOrderDetail(data.data)
  }

  const createOrder = async () => {
    if (!selectedProductId || planQty <= 0) {
      setMessage('请选择产品并输入有效数量')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId, planQty }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`工单创建成功：${data.data.orderNo}`)
        setPlanQty(100)
        setSelectedProductId('')
        await fetchOrders()
        await fetchStocks()
      } else {
        setMessage(data.error || '创建失败')
      }
    } catch (err) {
      setMessage('创建失败')
    }
    setLoading(false)
  }

  const confirmOrder = async (orderId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message)
        await fetchOrders()
      } else {
        setMessage(data.error || '确认失败')
      }
    } catch (err) {
      setMessage('确认失败')
    }
    setLoading(false)
  }

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order)
    fetchOrderDetail(order.id)
    setTab('detail')
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">MES-lite 生产系统</h1>
              <p className="text-sm text-gray-500">工厂生产全流程管理</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setTab('orders'); setSelectedOrder(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'orders' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              工单管理
            </button>
            <button
              onClick={() => { setTab('stocks'); setSelectedOrder(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'stocks' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              库存查询
            </button>
            <button
              onClick={() => { setTab('create'); setSelectedOrder(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'create' ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              创建工单
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {message && (
          <div className={`mb-4 p-4 rounded-lg text-sm ${
            message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {tab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">工单列表</h2>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">全部状态</option>
                  <option value="DRAFT">草稿</option>
                  <option value="CONFIRMED">已确认</option>
                  <option value="PICKED">已领料</option>
                  <option value="RUNNING">生产中</option>
                  <option value="QC_WAITING">待质检</option>
                  <option value="QC_DONE">质检完成</option>
                  <option value="COMPLETED">已完成</option>
                </select>
                <button
                  onClick={() => setTab('create')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
                >
                  新建工单
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-4">📋</p>
                <p>暂无工单</p>
                <button
                  onClick={() => setTab('create')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  创建第一个工单
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单号</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">计划数量</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">完成/报废</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">报工/领料</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectOrder(order)}>
                        <td className="px-4 py-3 font-mono text-blue-600">{order.orderNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{order.product.name}</div>
                          <div className="text-xs text-gray-500">{order.product.sku}</div>
                        </td>
                        <td className="px-4 py-3">{order.planQty}</td>
                        <td className="px-4 py-3">
                          <span className="text-green-600">{order.completeQty}</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-red-500">{order.scrapQty}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[order.status]}`}>
                            {statusLabels[order.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm">{order._count.reports}报工</span>
                          <span className="text-gray-400 mx-2">|</span>
                          <span className="text-sm">{order._count.picks}领料</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(order.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3">
                          {order.status === 'DRAFT' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); confirmOrder(order.id) }}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition"
                            >
                              确认
                            </button>
                          )}
                          {order.status !== 'DRAFT' && order.status !== 'COMPLETED' && (
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
                            >
                              详情
                            </button>
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

        {tab === 'stocks' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">库存查询</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock) => (
                <div key={stock.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800">
                        {stock.material?.name || stock.product?.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {stock.material?.code || stock.product?.sku}
                      </div>
                      {stock.material?.spec && (
                        <div className="text-xs text-gray-400">{stock.material.spec}</div>
                      )}
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {stock.material ? '原材料' : '成品'}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">库存</div>
                      <div className="text-lg font-semibold">{stock.qty} {stock.material?.unit || stock.product?.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">已预留</div>
                      <div className="text-lg font-semibold text-orange-600">{stock.reservedQty}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">可用</div>
                      <div className={`text-lg font-semibold ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>
                        {stock.availableQty}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'create' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
            <h2 className="text-xl font-semibold mb-6">创建工单</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择产品</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku}) - {product.category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">计划产量</label>
                <input
                  type="number"
                  value={planQty}
                  onChange={(e) => setPlanQty(Number(e.target.value))}
                  min={1}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={createOrder}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? '创建中...' : '创建工单'}
              </button>
            </div>
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-2">📋 创建流程</h3>
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                <li>选择产品后，系统自动读取 BOM 和工艺路线</li>
                <li>根据 BOM 计算物料需求（含损耗率）</li>
                <li>预留库存（减少可用库存）</li>
                <li>生成工单号和领料项</li>
              </ol>
            </div>
          </div>
        )}

        {tab === 'detail' && orderDetail && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">工单详情</h2>
                <p className="text-sm text-gray-500">{orderDetail.orderNo}</p>
              </div>
              <button
                onClick={() => { setTab('orders'); setOrderDetail(null) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                返回列表
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">产品</div>
                <div className="font-medium">{orderDetail.product.name}</div>
                <div className="text-xs text-gray-400">{orderDetail.product.sku}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">状态</div>
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[orderDetail.status]}`}>
                  {statusLabels[orderDetail.status]}
                </span>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">计划/完成</div>
                <div className="font-medium">{orderDetail.planQty} / {orderDetail.completeQty}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">报废数量</div>
                <div className="font-medium text-red-600">{orderDetail.scrapQty}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-4">📦 领料项</h3>
                <div className="space-y-2">
                  {orderDetail.picks.map((pick: PickItem) => (
                    <div key={pick.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium">{pick.material.name}</div>
                          <div className="text-xs text-gray-500">{pick.material.code}</div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${statusColors[pick.status]}`}>
                          {statusLabels[pick.status]}
                        </span>
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
                <h3 className="font-semibold mb-4">⚙️ 工艺路线</h3>
                <div className="space-y-2">
                  {orderDetail.routeSteps.map((step: ProcessStep) => (
                    <div key={step.id} className={`border rounded-lg p-3 ${
                      step.id === orderDetail.currentStepId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          step.id === orderDetail.currentStepId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {step.stepNo}
                        </span>
                        <div className="flex-1">
                          <div className="font-medium">{step.name}</div>
                          {step.workstation && (
                            <div className="text-xs text-gray-500">工作中心：{step.workstation}</div>
                          )}
                        </div>
                        {step.id === orderDetail.currentStepId && (
                          <span className="text-xs text-blue-600 font-medium">当前工序</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          MES-lite 工厂生产系统 · Next.js + Prisma + SQLite
        </div>
      </footer>
    </div>
  )
}
