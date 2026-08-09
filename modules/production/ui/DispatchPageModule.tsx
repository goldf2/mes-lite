'use client'

import { ReactNode, useMemo, useState, useEffect } from 'react'
import { AttachmentPanel } from '@/modules/attachments'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import SearchableSelect from '@/app/components/SearchableSelect'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import AppButton from '@/app/components/AppButton'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { BusinessDocumentDetailDialog, BusinessDocumentPrintLink, generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from '@/modules/business-documents'
import {
  DraftDocumentAttachmentPanel,
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/modules/attachments'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'
import {
  createDispatch,
  listDispatchCustomers,
  listDispatches,
  listDispatchOrders,
  listDispatchOrderSteps,
  transitionDispatch,
} from '../client/dispatch-api'
import {
  dispatchPriorityColors as priorityColors,
  dispatchPriorityLabels as priorityLabels,
  dispatchStatusColors as statusColors,
  dispatchStatusLabels as statusLabels,
  dispatchStatusOptions as statusOptions,
  type DispatchCustomer as Customer,
  type DispatchOrder as Order,
  type DispatchProcessStep as ProcessStep,
  type DispatchRecord as Dispatch,
} from '../contracts/dispatch'

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
  const [draftAttachmentOwnerId, setDraftAttachmentOwnerId] = useState('')
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)
  const [detailItem, setDetailItem] = useState<Dispatch | null>(null)
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
      setDispatches(await listDispatches(selectedStatuses, statusOptions.map((option) => option.value), selectedCustomerId))
    } catch (err) {
      onMessage('获取派工单列表失败')
    }
    setLoading(false)
  }

  const fetchOrders = async () => {
    try {
      setOrders(await listDispatchOrders(selectedCustomerId))
    } catch (err) {
      // ignore
    }
  }

  const fetchCustomers = async () => {
    try {
      setCustomers(await listDispatchCustomers())
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
      setSteps(await listDispatchOrderSteps(orderId))
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

  const openCreateDispatch = () => {
    resetForm()
    setDraftAttachmentOwnerId(createDraftDocumentAttachmentId())
    setShowModal(true)
  }

  const closeCreateDispatch = () => {
    if (loading || draftAttachmentBusy) return
    void discardDraftDocumentAttachments('DISPATCH', draftAttachmentOwnerId)
    setDraftAttachmentOwnerId('')
    setShowModal(false)
    resetForm()
  }

  const applyRecognizedDispatch = async (fields: Record<string, unknown>) => {
    const orderValue = recognizedText(fields, 'orderNo')
    const matchedOrder = orders.find((order) => matchesRecognizedValue(orderValue, [order.orderNo, order.targetMaterial?.code, order.targetMaterial?.name, order.product.sku, order.product.name]))
    let nextSteps = steps
    if (matchedOrder) {
      try {
        nextSteps = await listDispatchOrderSteps(matchedOrder.id)
      } catch {
        nextSteps = []
      }
      setSteps(nextSteps)
    }
    const stepValue = recognizedText(fields, 'processStep')
    const matchedStep = nextSteps.find((step) => matchesRecognizedValue(stepValue, [String(step.stepNo), step.name, step.workstation]))
    const priorityValue = recognizedText(fields, 'priority').toUpperCase()
    setForm((current) => ({
      ...current,
      voucherNo: recognizedText(fields, 'voucherNo') || current.voucherNo,
      orderId: matchedOrder?.id || current.orderId,
      stepId: matchedStep?.id || current.stepId,
      workerName: recognizedText(fields, 'workerName') || current.workerName,
      workerId: recognizedText(fields, 'workerId') || current.workerId,
      planQty: recognizedNumber(fields, 'planQty') || current.planQty,
      priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priorityValue) ? priorityValue : current.priority,
      note: recognizedText(fields, 'note') || current.note,
    }))
  }

  const handleSubmit = async () => {
    if (draftAttachmentBusy) {
      onMessage('请等待附件上传或 AI 识别完成')
      return
    }
    if (!form.orderId || !form.stepId || !form.workerName || form.planQty <= 0) {
      onMessage('请填写完整信息')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const result = await createDispatch({
        orderId: form.orderId,
        voucherNo: form.voucherNo || undefined,
        stepId: form.stepId,
        workerName: form.workerName,
        workerId: form.workerId || undefined,
        planQty: form.planQty,
        priority: form.priority,
        note: form.note || undefined,
      })
      if (result.ok && result.data) {
        onMessage(`派工单创建成功：${result.data.dispatchNo}`)
        try {
          await finalizeDraftDocumentAttachments({ ownerType: 'DISPATCH', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: result.data.id })
        } catch (error) {
          onMessage(`派工单已创建，但${error instanceof Error ? error.message : '附件绑定失败'}`)
        }
        const pdfGenerated = await generateBusinessDocumentPdfArchives('dispatch', [result.data.id])
        if (pdfGenerated) printPreview.open('dispatch', result.data.id)
        else {
          printPreview.close()
          onMessage('派工单已创建，但 PDF 生成失败，可在派工列表中重新打印')
        }
        setShowModal(false)
        setDraftAttachmentOwnerId('')
        resetForm()
        await fetchDispatches()
      } else {
        printPreview.close()
        onMessage(result.error || '创建派工单失败')
      }
    } catch (err) {
      printPreview.close()
      onMessage('创建派工单失败')
    }
    setLoading(false)
  }

  const handleAction = async (id: string, action: 'dispatch' | 'start' | 'complete') => {
    setLoading(true)
    try {
      const result = await transitionDispatch(id, action)
      if (result.ok) {
        onMessage(result.message || '操作成功')
        await fetchDispatches()
      } else {
        onMessage(result.error || '操作失败')
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
              onClick={openCreateDispatch}
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
                onClick={openCreateDispatch}
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
                  <AttachmentPanel ownerType="DISPATCH" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                    <BusinessDocumentPrintLink kind="dispatch" id={item.id} />
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
                  <th className="w-44 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
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
                      <AttachmentPanel ownerType="DISPATCH" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                        <BusinessDocumentPrintLink kind="dispatch" id={item.id} compact />
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailItem && (
        <BusinessDocumentDetailDialog
          title={`派工单 ${detailItem.dispatchNo}`}
          description={`凭据号：${detailItem.voucherNo || '-'} · ${statusLabels[detailItem.status] || detailItem.status}`}
          ownerType="DISPATCH"
          ownerId={detailItem.id}
          onClose={() => setDetailItem(null)}
          onMessage={onMessage}
          headerActions={<BusinessDocumentPrintLink kind="dispatch" id={detailItem.id} />}
        >
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-gray-500">工单</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.order?.orderNo || '-'}</dd></div>
            <div><dt className="text-gray-500">生产目标</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.order?.targetMaterial?.name || detailItem.order?.product?.name}</dd><dd className="text-xs text-gray-500">{detailItem.order?.targetMaterial?.code || detailItem.order?.product?.sku}</dd></div>
            <div><dt className="text-gray-500">工序</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.step?.stepNo} · {detailItem.step?.name}</dd><dd className="text-xs text-gray-500">{detailItem.step?.workstation || '未指定工作中心'}</dd></div>
            <div><dt className="text-gray-500">工人</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.workerName}</dd><dd className="text-xs text-gray-500">{detailItem.workerId || '-'}</dd></div>
            <div><dt className="text-gray-500">计划数量</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.planQty}</dd></div>
            <div><dt className="text-gray-500">优先级</dt><dd className="mt-1 font-medium text-gray-900">{priorityLabels[detailItem.priority] || detailItem.priority}</dd></div>
            <div><dt className="text-gray-500">创建时间</dt><dd className="mt-1 font-medium text-gray-900">{new Date(detailItem.createdAt).toLocaleString('zh-CN')}</dd></div>
            <div><dt className="text-gray-500">备注</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.note || '-'}</dd></div>
          </dl>
        </BusinessDocumentDetailDialog>
      )}

      {showModal && (
        <ModalDialog
          title="新建派工单"
          description="选择工单和工序后安排人员、数量与优先级。"
          onClose={closeCreateDispatch}
          closeDisabled={loading || draftAttachmentBusy}
          footer={(
            <ModalActions
              onCancel={closeCreateDispatch}
              onConfirm={handleSubmit}
              confirmLabel="创建并输出 PDF"
              busy={loading || draftAttachmentBusy}
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
              <DraftDocumentAttachmentPanel
                ownerType="DISPATCH"
                draftOwnerId={draftAttachmentOwnerId}
                onRecognized={applyRecognizedDispatch}
                onBusyChange={setDraftAttachmentBusy}
                onMessage={onMessage}
              />
            </div>
        </ModalDialog>
      )}
      </div>
    </>
  )
}
