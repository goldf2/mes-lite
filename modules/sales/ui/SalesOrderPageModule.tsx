'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import SearchableSelect from '@/app/components/SearchableSelect'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import TopBarPortal from '@/app/components/TopBarPortal'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { AttachmentPanel } from '@/modules/attachments'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { BusinessDocumentPrintLink, generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from '@/modules/business-documents'
import { MaterialDetailDialog, MaterialReferenceButton } from '@/modules/materials'
import type { MaterialReference } from '@/modules/materials'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import {
  DraftDocumentAttachmentPanel,
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/modules/attachments'
import { matchesRecognizedValue, recognizedDate, recognizedItems, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'
import {
  createSalesOrder,
  loadSalesOrderOptions,
  loadSalesOrders,
  updateSalesOrderPrices,
  updateSalesOrderStatus,
} from '../client/sales-order-api'
import type {
  SalesCustomerOption,
  SalesMaterialOption,
  SalesOrder,
  SalesOrderDraftLine,
  SalesOrderPriceEdit,
} from '../contracts/sales-order'
import {
  createSalesOrderDraftLine as newLine,
  dateText,
  localDate,
  money,
  numberText,
  salesOrderStatusMeta as statusMeta,
  salesOrderStatusOptions as statusOptions,
} from '../model/sales-order-view'

const emptyForm = () => ({
  voucherNo: '',
  customerId: '',
  orderDate: localDate(),
  deliveryDate: '',
  note: '',
  items: [newLine()],
})

export default function SalesOrderPageModule({
  onMessage,
}: {
  onMessage: (message: string) => void
}) {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [customers, setCustomers] = useState<SalesCustomerOption[]>([])
  const [materials, setMaterials] = useState<SalesMaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [statuses, setStatuses] = useState(statusOptions.map((option) => option.value))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [draftAttachmentOwnerId, setDraftAttachmentOwnerId] = useState('')
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)
  const [detailOrder, setDetailOrder] = useState<SalesOrder | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<MaterialReference | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.salesOrders.viewMode', 'card')
  const [form, setForm] = useState(emptyForm)
  const [pendingAction, setPendingAction] = useState<{ order: SalesOrder; action: 'confirm' | 'cancel' } | null>(null)
  const [priceEdit, setPriceEdit] = useState<SalesOrderPriceEdit | null>(null)
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: statuses.length === 1 ? statuses[0] : '', onChange: (value: string) => setStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '客户', value: customerId, onChange: setCustomerId, options: customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` })) },
  ], [customerId, customers, statuses])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(getStatusQuery(statuses, statusOptions))
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (customerId) params.set('customerId', customerId)
      setOrders(await loadSalesOrders(params))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取销售订单失败')
    } finally {
      setLoading(false)
    }
  }, [customerId, keyword, onMessage, statuses])

  const loadOptions = useCallback(async () => {
    try {
      const data = await loadSalesOrderOptions()
      setCustomers(data.customers)
      setMaterials(data.materials)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取销售订单选项失败')
    }
  }, [onMessage])

  useEffect(() => {
    const timer = window.setTimeout(loadOrders, 180)
    return () => window.clearTimeout(timer)
  }, [loadOrders])

  useEffect(() => { loadOptions() }, [loadOptions])

  const summary = useMemo(() => ({
    active: orders.filter((order) => ['CONFIRMED', 'PARTIAL'].includes(order.status)).length,
    completed: orders.filter((order) => order.status === 'COMPLETED').length,
    amount: orders.filter((order) => order.status !== 'CANCELLED').reduce((sum, order) => sum + Number(order.totalAmount), 0),
  }), [orders])

  const orderSort = useClientTableSort(orders, {
    orderNo: (order) => order.orderNo,
    customer: (order) => `${order.customer.code} ${order.customer.name}`,
    orderDate: (order) => new Date(order.orderDate),
    deliveryDate: (order) => order.deliveryDate ? new Date(order.deliveryDate) : null,
    status: (order) => statusMeta[order.status]?.label || order.status,
    amount: (order) => order.totalAmount,
    shipments: (order) => order._count.shipments,
  }, 'orderDate', 'desc')

  const formTotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0)

  const updateLine = (key: string, update: Partial<SalesOrderDraftLine>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => line.key === key ? { ...line, ...update } : line),
    }))
  }

  const openCreateOrder = () => {
    setForm(emptyForm())
    setDraftAttachmentOwnerId(createDraftDocumentAttachmentId())
    setFormOpen(true)
  }

  const closeCreateOrder = () => {
    if (saving || draftAttachmentBusy) return
    void discardDraftDocumentAttachments('SALES_ORDER', draftAttachmentOwnerId)
    setDraftAttachmentOwnerId('')
    setFormOpen(false)
  }

  const applyRecognizedOrder = (fields: Record<string, unknown>) => {
    const customerValue = recognizedText(fields, 'customer')
    const matchedCustomer = customers.find((customer) => matchesRecognizedValue(customerValue, [customer.code, customer.name]))
    const recognizedLines = recognizedItems(fields).map((item) => {
      const materialValue = recognizedText(item, 'material')
      const material = materials.find((option) => matchesRecognizedValue(materialValue, [option.code, option.name, option.spec]))
      return material ? {
        key: newLine().key,
        materialId: material.id,
        qty: recognizedNumber(item, 'qty'),
        unitPrice: recognizedNumber(item, 'unitPrice'),
        note: recognizedText(item, 'note'),
      } : null
    }).filter((item): item is SalesOrderDraftLine => Boolean(item))
    setForm((current) => ({
      ...current,
      voucherNo: recognizedText(fields, 'voucherNo') || current.voucherNo,
      customerId: matchedCustomer?.id || current.customerId,
      orderDate: recognizedDate(fields, 'orderDate') || current.orderDate,
      deliveryDate: recognizedDate(fields, 'deliveryDate') || current.deliveryDate,
      note: recognizedText(fields, 'note') || current.note,
      items: recognizedLines.length > 0 ? recognizedLines : current.items,
    }))
  }

  const saveOrder = async () => {
    if (draftAttachmentBusy) return onMessage('请等待附件上传或 AI 识别完成')
    if (!form.customerId) return onMessage('请选择客户')
    if (!form.orderDate) return onMessage('请选择订单日期')
    if (form.items.some((item) => !item.materialId || Number(item.qty) <= 0 || Number(item.unitPrice) < 0)) {
      return onMessage('请完整填写每条物料、数量和单价')
    }
    if (new Set(form.items.map((item) => item.materialId)).size !== form.items.length) {
      return onMessage('同一物料请合并为一条明细')
    }

    const printPreview = reserveBusinessDocumentPrintWindow()
    setSaving(true)
    try {
      const order = await createSalesOrder({
        ...form,
        items: form.items.map(({ key, ...item }) => item),
      })
      onMessage(`销售订单已创建：${order.orderNo}`)
      try {
        await finalizeDraftDocumentAttachments({ ownerType: 'SALES_ORDER', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: order.id })
      } catch (error) {
        onMessage(`销售订单已创建，但${error instanceof Error ? error.message : '附件绑定失败'}`)
      }
      const pdfGenerated = await generateBusinessDocumentPdfArchives('sales-order', [order.id])
      if (pdfGenerated) printPreview.open('sales-order', order.id)
      else {
        printPreview.close()
        onMessage('销售订单已创建，但 PDF 生成失败，可在订单列表中重新打印')
      }
      setFormOpen(false)
      setDraftAttachmentOwnerId('')
      setForm(emptyForm())
      await loadOrders()
    } catch (error) {
      printPreview.close()
      onMessage(error instanceof Error ? error.message : '创建销售订单失败')
    } finally {
      setSaving(false)
    }
  }

  const runAction = async () => {
    if (!pendingAction) return
    setSaving(true)
    try {
      const data = await updateSalesOrderStatus(pendingAction.order.id, pendingAction.action)
      onMessage(data.message || '操作成功')
      setPendingAction(null)
      await loadOrders()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const openPriceEdit = (order: SalesOrder) => {
    setPriceEdit({
      order,
      reason: '',
      items: order.items.map((item) => ({
        id: item.id,
        materialLabel: `${item.material.code} · ${item.material.name}`,
        qty: Number(item.qty),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
      })),
    })
  }

  const savePrices = async () => {
    if (!priceEdit) return
    if (priceEdit.items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      return onMessage('单价不能小于 0')
    }
    if (priceEdit.order.status !== 'DRAFT' && !priceEdit.reason.trim()) {
      return onMessage('已确认订单调价必须填写原因')
    }
    setSaving(true)
    try {
      const data = await updateSalesOrderPrices(priceEdit.order.id, {
        reason: priceEdit.reason.trim() || undefined,
        items: priceEdit.items.map((item) => ({ id: item.id, unitPrice: item.unitPrice })),
      })
      onMessage(data.message || '销售订单价格已更新')
      setPriceEdit(null)
      setDetailOrder(null)
      await loadOrders()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '调整销售订单价格失败')
    } finally {
      setSaving(false)
    }
  }

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={(
        <SearchFieldWithPresets
          storageKey="mes-lite.searchPresets.salesOrders"
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索订单号、客户、物料或规格"
        />
      )}
      advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
      viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
      actions={<AppButton variant="create" onClick={openCreateOrder}>新建销售订单</AppButton>}
    />
  )

  const orderActions = (order: SalesOrder, compact = false) => (
    <div className="flex flex-wrap gap-2">
      <AppButton size="sm" variant="secondary" onClick={() => setDetailOrder(order)}>详情</AppButton>
      <BusinessDocumentPrintLink kind="sales-order" id={order.id} compact={compact} />
      {['DRAFT', 'CONFIRMED'].includes(order.status) && <AppButton size="sm" variant="secondary" onClick={() => openPriceEdit(order)}>调整价格</AppButton>}
      {order.status === 'DRAFT' && <AppButton size="sm" variant="primary" onClick={() => setPendingAction({ order, action: 'confirm' })}>确认订单</AppButton>}
      {['DRAFT', 'CONFIRMED'].includes(order.status) && <AppButton size="sm" variant="secondary" onClick={() => setPendingAction({ order, action: 'cancel' })}>取消订单</AppButton>}
    </div>
  )

  return (
    <>
      <TopBarPortal>{toolbar}</TopBarPortal>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="border-b-2 border-blue-500 bg-white px-4 py-3"><div className="text-xs text-gray-500">执行中订单</div><div className="mt-1 text-xl font-semibold text-gray-900">{summary.active}</div></div>
          <div className="border-b-2 border-emerald-500 bg-white px-4 py-3"><div className="text-xs text-gray-500">已完成订单</div><div className="mt-1 text-xl font-semibold text-gray-900">{summary.completed}</div></div>
          <div className="border-b-2 border-slate-500 bg-white px-4 py-3"><div className="text-xs text-gray-500">当前列表金额</div><div className="mt-1 text-xl font-semibold text-gray-900">{money(summary.amount)}</div></div>
        </div>

        <div className="bg-white shadow-sm">
          {loading && orders.length === 0 ? (
            <AppLoadingIndicator label="正在加载销售订单..." />
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">暂无销售订单</div>
          ) : viewMode === 'card' ? (
            <div className="divide-y divide-gray-200">
              {orderSort.sortedRows.map((order) => {
                const meta = statusMeta[order.status] || { label: order.status, className: 'bg-gray-100 text-gray-700' }
                return (
                  <article key={order.id} className="px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-blue-700">{order.orderNo}</span>
                          <span className={`rounded px-2 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-gray-900">{order.customer.name}</div>
                        <div className="mt-1 text-xs text-gray-500">订单日期 {dateText(order.orderDate)} · 交付日期 {dateText(order.deliveryDate)} · 客户单号 {order.voucherNo || '-'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">订单金额</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">{money(order.totalAmount)}</div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto border-y border-gray-100">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-gray-50 text-left text-xs text-gray-500">
                          <tr><th className="px-3 py-2 font-medium">物料</th><th className="px-3 py-2 font-medium">订购</th><th className="px-3 py-2 font-medium">待发占用</th><th className="px-3 py-2 font-medium">已发</th><th className="px-3 py-2 font-medium">未发数量</th><th className="px-3 py-2 text-right font-medium">价格 / 金额</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2"><MaterialReferenceButton material={item.material} onOpen={setDetailMaterial} /></td>
                              <td className="px-3 py-2">{numberText(item.qty)} {item.unit}</td>
                              <td className="px-3 py-2 text-amber-700">{numberText(item.pendingQty)} {item.unit}</td>
                              <td className="px-3 py-2 text-emerald-700">{numberText(item.shippedQty)} {item.unit}</td>
                              <td className="px-3 py-2 font-medium text-blue-700">{numberText(item.remainingQty)} {item.unit}</td>
                              <td className="px-3 py-2 text-right"><div>{money(item.totalAmount)}</div><div className="text-xs text-gray-500">{money(item.unitPrice)} / {item.unit} · {item.priceSource === 'MATERIAL_DEFAULT' ? '物料默认价' : '手工价'}</div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500">{order.note || `已关联 ${order._count.shipments} 张发货单`}</div>
                        <AttachmentPanel ownerType="SALES_ORDER" ownerId={order.id} compact compactMode="summary" onMessage={onMessage} />
                      </div>
                      {orderActions(order)}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableTableHeader column="orderNo" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>销售订单</SortableTableHeader>
                    <SortableTableHeader column="customer" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>客户</SortableTableHeader>
                    <SortableTableHeader column="orderDate" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>订单日期</SortableTableHeader>
                    <SortableTableHeader column="deliveryDate" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>交付日期</SortableTableHeader>
                    <SortableTableHeader column="status" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>状态</SortableTableHeader>
                    <SortableTableHeader column="amount" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>金额</SortableTableHeader>
                    <SortableTableHeader column="shipments" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>发货单</SortableTableHeader>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orderSort.sortedRows.map((order) => {
                    const meta = statusMeta[order.status] || { label: order.status, className: 'bg-gray-100 text-gray-700' }
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><div className="font-mono font-semibold text-blue-700">{order.orderNo}</div><div className="text-xs text-gray-500">客户单号：{order.voucherNo || '-'}</div></td>
                        <td className="px-4 py-3"><div className="font-medium text-gray-900">{order.customer.name}</div><div className="text-xs text-gray-500">{order.customer.code}</div></td>
                        <td className="px-4 py-3 text-gray-700">{dateText(order.orderDate)}</td>
                        <td className="px-4 py-3 text-gray-700">{dateText(order.deliveryDate)}</td>
                        <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span></td>
                        <td className="px-4 py-3 font-medium text-gray-900">{money(order.totalAmount)}</td>
                        <td className="px-4 py-3 text-gray-700">{order._count.shipments} 张</td>
                        <td className="px-4 py-3"><AttachmentPanel ownerType="SALES_ORDER" ownerId={order.id} compact compactMode="summary" onMessage={onMessage} /></td>
                        <td className="px-4 py-3">{orderActions(order, true)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailOrder && !detailMaterial && (
        <ModalDialog
          title="销售订单详情"
          description={`${detailOrder.orderNo} · ${detailOrder.customer.name}`}
          size="wide"
          onClose={() => { setDetailMaterial(null); setDetailOrder(null) }}
          headerActions={<BusinessDocumentPrintLink kind="sales-order" id={detailOrder.id} />}
        >
          <div className="space-y-6">
            <section>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">系统生成单据</span>
                <span className={`rounded px-2 py-1 text-xs font-medium ${(statusMeta[detailOrder.status] || { className: 'bg-gray-100 text-gray-700' }).className}`}>
                  {(statusMeta[detailOrder.status] || { label: detailOrder.status }).label}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailValue label="客户" value={detailOrder.customer.name} />
                <DetailValue label="客户单号" value={detailOrder.voucherNo || '-'} />
                <DetailValue label="订单 / 交付日期" value={`${dateText(detailOrder.orderDate)} / ${dateText(detailOrder.deliveryDate)}`} />
                <DetailValue label="订单金额" value={money(detailOrder.totalAmount)} />
              </div>
              {detailOrder.note && <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">{detailOrder.note}</div>}
            </section>

            <section>
              <h4 className="mb-3 text-sm font-semibold text-gray-900">订单明细</h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr><th className="px-3 py-2 font-medium">物料</th><th className="px-3 py-2 font-medium">订购</th><th className="px-3 py-2 font-medium">待发占用</th><th className="px-3 py-2 font-medium">已发</th><th className="px-3 py-2 font-medium">未发数量</th><th className="px-3 py-2 text-right font-medium">价格 / 金额</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detailOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2"><MaterialReferenceButton material={item.material} onOpen={setDetailMaterial} /></td>
                        <td className="px-3 py-2">{numberText(item.qty)} {item.unit}</td>
                        <td className="px-3 py-2 text-amber-700">{numberText(item.pendingQty)} {item.unit}</td>
                        <td className="px-3 py-2 text-emerald-700">{numberText(item.shippedQty)} {item.unit}</td>
                        <td className="px-3 py-2 font-medium text-blue-700">{numberText(item.remainingQty)} {item.unit}</td>
                        <td className="px-3 py-2 text-right"><div>{money(item.totalAmount)}</div><div className="text-xs text-gray-500">{money(item.unitPrice)} / {item.unit} · {item.priceSource === 'MATERIAL_DEFAULT' ? '物料默认价' : '手工价'}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <AttachmentPanel ownerType="SALES_ORDER" ownerId={detailOrder.id} title="附件管理" enableAiRecognition onMessage={onMessage} />
          </div>
        </ModalDialog>
      )}

      <MaterialDetailDialog
        key={detailMaterial?.id || 'closed-material-detail'}
        material={detailMaterial}
        onClose={() => setDetailMaterial(null)}
        onMessage={onMessage}
      />

      {formOpen && (
        <ModalDialog
          title="新建销售订单"
          description="记录客户需求和价格；销售订单与发货管理保持独立。"
          size="wide"
          onClose={closeCreateOrder}
          closeDisabled={saving || draftAttachmentBusy}
          footer={<ModalActions onCancel={closeCreateOrder} onConfirm={saveOrder} confirmLabel="创建并输出 PDF" busy={saving || draftAttachmentBusy} />}
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">客户</label>
                <SearchableSelect
                  value={form.customerId}
                  onChange={(value) => setForm({ ...form, customerId: value })}
                  options={customers.map((customer) => ({ value: customer.id, label: customer.name, keywords: `${customer.code} ${customer.contact || ''} ${customer.phone || ''}` }))}
                  placeholder="输入客户名称、联系人或电话筛选"
                />
              </div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">订单日期</label><input type="date" value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">计划交付</label><input type="date" value={form.deliveryDate} onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">客户订单号/凭据号</label><input value={form.voucherNo} onChange={(event) => setForm({ ...form, voucherNo: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">备注</label><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div><div className="text-sm font-semibold text-gray-900">销售明细</div><div className="mt-1 text-xs text-gray-500">数量按物料库存单位填写，可在一张订单中添加多个成品。</div></div>
                <AppButton size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, items: [...current.items, newLine()] }))}><Plus className="h-4 w-4" />添加物料</AppButton>
              </div>
              <div className="space-y-3">
                {form.items.map((line, index) => {
                  const material = materials.find((item) => item.id === line.materialId)
                  return (
                    <div key={line.key} className="grid items-end gap-3 border-b border-gray-100 pb-3 md:grid-cols-[minmax(240px,1fr)_140px_140px_120px_40px]">
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">物料 {index + 1}</label><SearchableSelect value={line.materialId} onChange={(value) => { const selected = materials.find((item) => item.id === value); updateLine(line.key, { materialId: value, unitPrice: selected?.defaultSalePrice == null ? 0 : Number(selected.defaultSalePrice) }) }} options={materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: item.spec || '' }))} placeholder="输入编码、名称或规格" /></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">数量 {material ? `(${material.stockUnit || material.unit})` : ''}</label><input type="number" min={0} step="any" value={line.qty || ''} onChange={(event) => updateLine(line.key, { qty: Number(event.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">单价</label><input type="number" min={0} step="0.01" value={line.unitPrice || ''} onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /><div className="mt-1 text-[11px] text-gray-500">{material?.defaultSalePrice == null ? '物料未设置默认价' : line.unitPrice === Number(material.defaultSalePrice) ? '来自物料默认价' : '已手工调整'}</div></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">金额</label><div className="flex h-10 items-center justify-end font-medium text-gray-900">{money(line.qty * line.unitPrice)}</div></div>
                      <button type="button" aria-label="移除销售明细" title="移除" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== line.key) }))} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-25"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex justify-end text-sm"><span className="text-gray-500">订单合计</span><strong className="ml-3 text-lg text-gray-900">{money(formTotal)}</strong></div>
            </div>
            <DraftDocumentAttachmentPanel
              ownerType="SALES_ORDER"
              draftOwnerId={draftAttachmentOwnerId}
              onRecognized={applyRecognizedOrder}
              onBusyChange={setDraftAttachmentBusy}
              onMessage={onMessage}
            />
          </div>
        </ModalDialog>
      )}

      {priceEdit && (
        <ModalDialog
          title="调整销售订单价格"
          description={`${priceEdit.order.orderNo} · 已产生发货记录后价格将锁定`}
          size="lg"
          onClose={() => setPriceEdit(null)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setPriceEdit(null)} onConfirm={savePrices} confirmLabel="保存价格" busy={saving} />}
        >
          <div className="space-y-4">
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {priceEdit.items.map((item, index) => (
                <div key={item.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_150px]">
                  <div>
                    <div className="font-medium text-gray-900">{item.materialLabel}</div>
                    <div className="text-xs text-gray-500">{numberText(item.qty)} {item.unit}</div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={`${item.materialLabel} 单价`}
                    value={item.unitPrice}
                    onChange={(event) => setPriceEdit((current) => current ? {
                      ...current,
                      items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, unitPrice: Number(event.target.value) } : line),
                    } : current)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                  <div className="text-right font-medium text-gray-900">{money(item.qty * item.unitPrice)}</div>
                </div>
              ))}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">调价原因{priceEdit.order.status === 'DRAFT' ? '（可选）' : ''}</label>
              <textarea
                rows={3}
                value={priceEdit.reason}
                onChange={(event) => setPriceEdit((current) => current ? { ...current, reason: event.target.value } : current)}
                placeholder="说明报价变更、客户协商或其他调价原因"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </div>
          </div>
        </ModalDialog>
      )}

      {pendingAction && (
        <ModalDialog
          title={pendingAction.action === 'confirm' ? '确认销售订单' : '取消销售订单'}
          description={pendingAction.order.orderNo}
          size="sm"
          onClose={() => setPendingAction(null)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setPendingAction(null)} onConfirm={runAction} confirmLabel={pendingAction.action === 'confirm' ? '确认订单' : '确认取消'} confirmVariant={pendingAction.action === 'confirm' ? 'primary' : 'danger'} busy={saving} />}
        >
          <p className="text-sm text-gray-600">{pendingAction.action === 'confirm' ? '确认后销售需求将锁定；发货业务仍在发货管理中独立维护。' : '取消后订单停止继续执行，历史关联记录仍保留。'}</p>
        </ModalDialog>
      )}
    </>
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-gray-200 px-4 py-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 font-medium text-gray-900">{value}</div></div>
}
