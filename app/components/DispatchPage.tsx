'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'

interface Order {
  id: string
  orderNo: string
  status: string
  planQty: number
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  targetMaterial?: { id: string; name: string; code: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null
}

interface Customer {
  id: string
  code: string
  name: string
}

interface ProcessStep {
  id: string
  stepNo: number
  name: string
  workstation: string | null
}

interface Dispatch {
  id: string
  dispatchNo: string
  orderId: string
  stepId: string
  workerName: string
  workerId?: string
  planQty: number
  priority: string
  status: string
  note?: string
  createdAt: string
  order: { id: string; orderNo: string; product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }; targetMaterial?: { id: string; name: string; code: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null }
  step: { id: string; stepNo: number; name: string; workstation?: string | null }
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待派工',
  DISPATCHED: '已派工',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

const statusOptions = [
  { value: 'PENDING', label: '待派工' },
  { value: 'DISPATCHED', label: '已派工' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

const priorityLabels: Record<string, string> = {
  LOW: '低',
  NORMAL: '正常',
  HIGH: '高',
  URGENT: '紧急',
}

export default function DispatchPage({
  onMessage,
  onToolbarChange,
  onCreateOrder,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  onCreateOrder?: () => void
}) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [steps, setSteps] = useState<ProcessStep[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.dispatch.viewMode', 'list')

  const [form, setForm] = useState({
    orderId: '',
    stepId: '',
    workerName: '',
    workerId: '',
    planQty: 0,
    priority: 'NORMAL',
    note: '',
  })

  useEffect(() => {
    fetchDispatches()
    fetchOrders()
    fetchCustomers()
  }, [selectedStatuses, selectedCustomerId])

  const fetchDispatches = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/dispatches?${params.toString()}` : '/api/dispatches'
      const res = await fetch(url)
      const data = await res.json()
      setDispatches(data.data || [])
    } catch (err) {
      onMessage('获取派工单列表失败')
    }
    setLoading(false)
  }

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams({ status: 'PICKED' })
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const res = await fetch(`/api/orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.data || [])
      }
    } catch (err) {
      // ignore
    }
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

  const fetchOrderSteps = async (orderId: string) => {
    if (!orderId) {
      setSteps([])
      return
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`)
      if (res.ok) {
        const data = await res.json()
        setSteps(data.data?.routeSteps || [])
      } else {
        setSteps([])
      }
    } catch (err) {
      setSteps([])
    }
  }

  const resetForm = () => {
    setForm({
      orderId: '',
      stepId: '',
      workerName: '',
      workerId: '',
      planQty: 0,
      priority: 'NORMAL',
      note: '',
    })
    setSteps([])
  }

  const handleSubmit = async () => {
    if (!form.orderId || !form.stepId || !form.workerName || form.planQty <= 0) {
      onMessage('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: form.orderId,
          stepId: form.stepId,
          workerName: form.workerName,
          workerId: form.workerId || undefined,
          planQty: form.planQty,
          priority: form.priority,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`派工单创建成功：${data.data.dispatchNo}`)
        setShowModal(false)
        resetForm()
        await fetchDispatches()
      } else {
        onMessage(data.error || '创建派工单失败')
      }
    } catch (err) {
      onMessage('创建派工单失败')
    }
    setLoading(false)
  }

  const handleAction = async (id: string, action: 'dispatch' | 'start' | 'complete') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dispatches/${id}/${action}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '操作成功')
        await fetchDispatches()
      } else {
        onMessage(data.error || '操作失败')
      }
    } catch (err) {
      onMessage('操作失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        filters={(
          <>
            <StatusCheckboxFilter options={statusOptions} value={selectedStatuses} onChange={setSelectedStatuses} />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部客户</option>
              <option value="__UNASSIGNED__">通用/未绑定</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </>
        )}
        actions={(
          <>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            {onCreateOrder && (
              <button
                onClick={onCreateOrder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                创建工单
              </button>
            )}
            <button
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
            >
              新增派工单
            </button>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedStatuses, selectedCustomerId, customers, onCreateOrder, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          filters={(
            <>
              <StatusCheckboxFilter options={statusOptions} value={selectedStatuses} onChange={setSelectedStatuses} />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部客户</option>
                <option value="__UNASSIGNED__">通用/未绑定</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </>
          )}
          actions={(
            <>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              {onCreateOrder && (
                <button
                  onClick={onCreateOrder}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  创建工单
                </button>
              )}
              <button
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
              >
                新增派工单
              </button>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        {dispatches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-4">📋</p>
            <p>暂无派工单</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {dispatches.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.dispatchNo}</div>
                    <div className="mt-1 text-xs text-gray-500">工单：{item.order?.orderNo}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${priorityColors[item.priority]}`}>
                      {priorityLabels[item.priority] || item.priority}
                    </span>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                      {statusLabels[item.status] || item.status}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-500">生产目标</div>
                    <div className="mt-1 font-medium text-gray-900">{item.order?.targetMaterial?.name || item.order?.product?.name}</div>
                    <div className="text-xs text-gray-500">
                      {item.order?.targetMaterial ? `物料 ${item.order.targetMaterial.code}` : item.order?.product?.sku}
                    </div>
                    <div className="text-xs text-gray-500">
                      客户：{item.order?.targetMaterial?.customer?.name || item.order?.product?.customer?.name || '通用/未绑定'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">工序与人员</div>
                    <div className="mt-1 font-medium text-gray-900">{item.step?.name} · 工序 {item.step?.stepNo}</div>
                    <div className="text-xs text-gray-500">工人：{item.workerName}{item.workerId ? ` (${item.workerId})` : ''}</div>
                    <div className="text-xs text-gray-500">计划数量：{item.planQty}</div>
                  </div>
                </div>
                {item.note && <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">{item.note}</div>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="DISPATCH" ownerId={item.id} compact onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'PENDING' && (
                      <button
                        onClick={() => handleAction(item.id, 'dispatch')}
                        disabled={loading}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        派工
                      </button>
                    )}
                    {item.status === 'DISPATCHED' && (
                      <button
                        onClick={() => handleAction(item.id, 'start')}
                        disabled={loading}
                        className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 transition disabled:opacity-50"
                      >
                        开始
                      </button>
                    )}
                    {item.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleAction(item.id, 'complete')}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                      >
                        完成
                      </button>
                    )}
                    {(item.status === 'COMPLETED' || item.status === 'CANCELLED') && (
                      <span className="text-xs text-gray-400">无操作</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">派工单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工序</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工人</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">计划数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">优先级</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dispatches.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.dispatchNo}</td>
                    <td className="px-4 py-3 font-mono text-sm">{item.order?.orderNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.order?.targetMaterial?.name || item.order?.product?.name}</div>
                      <div className="text-xs text-gray-500">
                        {item.order?.targetMaterial ? `物料 ${item.order.targetMaterial.code}` : item.order?.product?.sku}
                      </div>
                      <div className="text-xs text-gray-500">
                        客户：{item.order?.targetMaterial?.customer?.name || item.order?.product?.customer?.name || '通用/未绑定'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.step?.name}</div>
                      <div className="text-xs text-gray-500">工序 {item.step?.stepNo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.workerName}</div>
                      {item.workerId && <div className="text-xs text-gray-500">{item.workerId}</div>}
                    </td>
                    <td className="px-4 py-3">{item.planQty}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${priorityColors[item.priority]}`}>
                        {priorityLabels[item.priority] || item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="DISPATCH" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'PENDING' && (
                        <button
                          onClick={() => handleAction(item.id, 'dispatch')}
                          disabled={loading}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          派工
                        </button>
                      )}
                      {item.status === 'DISPATCHED' && (
                        <button
                          onClick={() => handleAction(item.id, 'start')}
                          disabled={loading}
                          className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 transition disabled:opacity-50"
                        >
                          开始
                        </button>
                      )}
                      {item.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => handleAction(item.id, 'complete')}
                          disabled={loading}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                        >
                          完成
                        </button>
                      )}
                      {(item.status === 'COMPLETED' || item.status === 'CANCELLED') && (
                        <span className="text-xs text-gray-400">无操作</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新增派工单</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">工单</label>
                <select
                  value={form.orderId}
                  onChange={(e) => {
                    const orderId = e.target.value
                    setForm({ ...form, orderId, stepId: '' })
                    fetchOrderSteps(orderId)
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择工单</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNo} - {o.targetMaterial?.name || o.product.name} (计划 {o.planQty})
                    </option>
                  ))}
                </select>
                {orders.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">暂无可派工单（需 PICKED 状态工单）</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">工序</label>
                <select
                  value={form.stepId}
                  onChange={(e) => setForm({ ...form, stepId: e.target.value })}
                  disabled={!form.orderId}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">请选择工序</option>
                  {steps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.stepNo}. {s.name}{s.workstation ? ` (${s.workstation})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">工人姓名</label>
                  <input
                    type="text"
                    value={form.workerName}
                    onChange={(e) => setForm({ ...form, workerName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">工号</label>
                  <input
                    type="text"
                    value={form.workerId}
                    onChange={(e) => setForm({ ...form, workerId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">计划数量</label>
                  <input
                    type="number"
                    value={form.planQty || ''}
                    onChange={(e) => setForm({ ...form, planQty: Number(e.target.value) })}
                    min={1}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="LOW">低</option>
                    <option value="NORMAL">正常</option>
                    <option value="HIGH">高</option>
                    <option value="URGENT">紧急</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? '提交中...' : '提交'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
