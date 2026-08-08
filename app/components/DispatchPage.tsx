'use client'

import { ReactNode, useMemo, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import SearchableSelect from './SearchableSelect'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import { MappedResourceAdvancedSearch } from './resource'

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
  voucherNo?: string | null
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
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.dispatch.viewMode.v2', 'card')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
  ], [customers, selectedCustomerId, selectedStatuses])

  const [form, setForm] = useState({
    voucherNo: '',
    orderId: '',
    stepId: '',
    workerName: '',
    workerId: '',
    planQty: 0,
    priority: 'NORMAL',
    note: '',
  })
  const dispatchSort = useClientTableSort(dispatches, {
    dispatchNo: (item) => item.dispatchNo,
    voucherNo: (item) => item.voucherNo,
    orderNo: (item) => item.order?.orderNo,
    material: (item) => item.order?.targetMaterial?.name || item.order?.product?.name,
    step: (item) => `${item.step?.stepNo || 0} ${item.step?.name || ''}`,
    worker: (item) => item.workerName,
    planQty: (item) => item.planQty,
    priority: (item) => priorityLabels[item.priority] || item.priority,
    status: (item) => statusLabels[item.status] || item.status,
  }, 'dispatchNo', 'desc')

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
      voucherNo: '',
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
          voucherNo: form.voucherNo || undefined,
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
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            {onCreateOrder && (
              <button
                onClick={onCreateOrder}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                工单
              </button>
            )}
            <AppButton
              variant="create"
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
            >
              新建派工单
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, onToolbarChange, selectedStatuses, selectedCustomerId, customers, onCreateOrder, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              {onCreateOrder && (
                <button
                  onClick={onCreateOrder}
                  className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition sm:px-4 sm:py-2 sm:text-sm"
                >
                  工单
                </button>
              )}
              <AppButton
                variant="create"
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
              >
                新建派工单
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-3 sm:p-6">
        {dispatches.length === 0 ? (
          <div className="text-center py-8 text-gray-500 sm:py-12">
            <p className="text-4xl mb-4">📋</p>
            <p>暂无派工单</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {dispatchSort.sortedRows.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.dispatchNo}</div>
                    <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
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
                <div className="mt-3 grid gap-3 md:grid-cols-2 sm:mt-4">
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
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[1280px]">
              <thead className="bg-gray-50">
                <tr>
                  <SortableTableHeader column="dispatchNo" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-40 whitespace-nowrap">派工单号</SortableTableHeader>
                  <SortableTableHeader column="voucherNo" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-36 whitespace-nowrap">凭据号</SortableTableHeader>
                  <SortableTableHeader column="orderNo" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-40 whitespace-nowrap">工单号</SortableTableHeader>
                  <SortableTableHeader column="material" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="min-w-64">物料</SortableTableHeader>
                  <SortableTableHeader column="step" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-32 whitespace-nowrap">工序</SortableTableHeader>
                  <SortableTableHeader column="worker" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-32 whitespace-nowrap">工人</SortableTableHeader>
                  <SortableTableHeader column="planQty" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-24 whitespace-nowrap text-center">计划数量</SortableTableHeader>
                  <SortableTableHeader column="priority" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-24 whitespace-nowrap">优先级</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={dispatchSort.sortColumn} direction={dispatchSort.sortDirection} onSort={dispatchSort.toggleSort} className="w-24 whitespace-nowrap">状态</SortableTableHeader>
                  <th className="w-44 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="w-24 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dispatchSort.sortedRows.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-blue-600">{item.dispatchNo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm">{item.order?.orderNo}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{item.order?.targetMaterial?.name || item.order?.product?.name}</div>
                      <div className="text-xs text-gray-500">
                        {item.order?.targetMaterial ? `物料 ${item.order.targetMaterial.code}` : item.order?.product?.sku}
                      </div>
                      <div className="text-xs text-gray-500">
                        客户：{item.order?.targetMaterial?.customer?.name || item.order?.product?.customer?.name || '通用/未绑定'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="font-medium">{item.step?.name}</div>
                      <div className="text-xs text-gray-500">工序 {item.step?.stepNo}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="font-medium">{item.workerName}</div>
                      {item.workerId && <div className="text-xs text-gray-500">{item.workerId}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-semibold">{item.planQty}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${priorityColors[item.priority]}`}>
                        {priorityLabels[item.priority] || item.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="DISPATCH" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
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
        <ModalDialog
          title="新建派工单"
          description="选择工单和工序后安排人员、数量与优先级。"
          onClose={() => setShowModal(false)}
          closeDisabled={loading}
          footer={(
            <ModalActions
              onCancel={() => setShowModal(false)}
              onConfirm={handleSubmit}
              confirmLabel="提交"
              busy={loading}
            />
          )}
        >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
                <input
                  type="text"
                  value={form.voucherNo}
                  onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  placeholder="外部任务单号、纸质派工单号"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">工单</label>
                <SearchableSelect
                  value={form.orderId}
                  onChange={(orderId) => {
                    setForm({ ...form, orderId, stepId: '' })
                    fetchOrderSteps(orderId)
                  }}
                  options={orders.map((order) => ({
                    value: order.id,
                    label: `${order.orderNo} · ${order.targetMaterial?.name || order.product.name} · 计划 ${order.planQty}`,
                    keywords: `${order.targetMaterial?.code || order.product.sku}`,
                  }))}
                  placeholder="输入工单号或物料筛选"
                />
                {orders.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">暂无可派工单（需 PICKED 状态工单）</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">工序</label>
                <SearchableSelect
                  value={form.stepId}
                  onChange={(stepId) => setForm({ ...form, stepId })}
                  disabled={!form.orderId}
                  options={steps.map((step) => ({
                    value: step.id,
                    label: `${step.stepNo}. ${step.name}${step.workstation ? ` · ${step.workstation}` : ''}`,
                  }))}
                  placeholder="输入工序名称或工位筛选"
                />
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
            </div>
        </ModalDialog>
      )}
      </div>
    </>
  )
}
