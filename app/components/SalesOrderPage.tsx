'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import AppButton from './AppButton'
import ModalDialog, { ModalActions } from './ModalDialog'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import SearchableSelect from './SearchableSelect'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import { getStatusQuery } from './StatusCheckboxFilter'
import TopBarPortal from './TopBarPortal'
import AppLoadingIndicator from './AppLoadingIndicator'
import { MappedResourceAdvancedSearch } from './resource'
import BusinessDocumentPrintLink, { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from './BusinessDocumentPrintLink'

interface CustomerOption {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
}

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  stockUnit: string
  unit: string
}

interface SalesOrderItem {
  id: string
  qty: number
  shippedQty: number
  pendingQty: number
  remainingQty: number
  unit: string
  unitPrice: number
  totalAmount: number
  note?: string | null
  material: MaterialOption
}

interface SalesOrder {
  id: string
  orderNo: string
  voucherNo?: string | null
  status: string
  orderDate: string
  deliveryDate?: string | null
  totalAmount: number
  note?: string | null
  customer: CustomerOption
  items: SalesOrderItem[]
  _count: { shipments: number }
}

interface DraftLine {
  key: string
  materialId: string
  qty: number
  unitPrice: number
  note: string
}

const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'PARTIAL', label: '部分发货' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const statusMeta: Record<string, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-blue-50 text-blue-700' },
  PARTIAL: { label: '部分发货', className: 'bg-amber-50 text-amber-700' },
  COMPLETED: { label: '已完成', className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: '已取消', className: 'bg-red-50 text-red-700' },
}

const localDate = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const newLine = (): DraftLine => ({
  key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  materialId: '',
  qty: 0,
  unitPrice: 0,
  note: '',
})

const emptyForm = () => ({
  voucherNo: '',
  customerId: '',
  orderDate: localDate(),
  deliveryDate: '',
  note: '',
  items: [newLine()],
})

const numberText = (value: number) => Number(value || 0).toFixed(3).replace(/\.?0+$/, '')
const money = (value: number) => `¥${Number(value || 0).toFixed(2)}`
const dateText = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN') : '-'

export default function SalesOrderPage({
  onMessage,
  onOpenShipment,
}: {
  onMessage: (message: string) => void
  onOpenShipment?: () => void
}) {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [statuses, setStatuses] = useState(statusOptions.map((option) => option.value))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [pendingAction, setPendingAction] = useState<{ order: SalesOrder; action: 'confirm' | 'cancel' } | null>(null)
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
      const response = await fetch(`/api/sales-orders?${params}`)
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '获取销售订单失败')
      setOrders(data.data || [])
    } catch {
      onMessage('获取销售订单失败')
    } finally {
      setLoading(false)
    }
  }, [customerId, keyword, onMessage, statuses])

  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/sales-orders/options')
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '获取销售订单选项失败')
      setCustomers(data.customers || [])
      setMaterials(data.materials || [])
    } catch {
      onMessage('获取销售订单选项失败')
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

  const formTotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0)

  const updateLine = (key: string, update: Partial<DraftLine>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => line.key === key ? { ...line, ...update } : line),
    }))
  }

  const saveOrder = async () => {
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
      const response = await fetch('/api/sales-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items: form.items.map(({ key, ...item }) => item),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        printPreview.close()
        return onMessage(data.error || '创建销售订单失败')
      }
      onMessage(`销售订单已创建：${data.data.orderNo}`)
      const pdfGenerated = await generateBusinessDocumentPdfArchives('sales-order', [data.data.id])
      if (pdfGenerated) printPreview.open('sales-order', data.data.id)
      else {
        printPreview.close()
        onMessage('销售订单已创建，但 PDF 生成失败，可在订单列表中重新打印')
      }
      setFormOpen(false)
      setForm(emptyForm())
      await loadOrders()
    } catch {
      printPreview.close()
      onMessage('创建销售订单失败')
    } finally {
      setSaving(false)
    }
  }

  const runAction = async () => {
    if (!pendingAction) return
    setSaving(true)
    try {
      const response = await fetch(`/api/sales-orders/${pendingAction.order.id}/${pendingAction.action}`, { method: 'PATCH' })
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '操作失败')
      onMessage(data.message || '操作成功')
      setPendingAction(null)
      await loadOrders()
    } catch {
      onMessage('操作失败')
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
      actions={<AppButton variant="create" onClick={() => { setForm(emptyForm()); setFormOpen(true) }}>新建销售订单</AppButton>}
    />
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
          ) : (
            <div className="divide-y divide-gray-200">
              {orders.map((order) => {
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
                          <tr><th className="px-3 py-2 font-medium">物料</th><th className="px-3 py-2 font-medium">订购</th><th className="px-3 py-2 font-medium">待发单占用</th><th className="px-3 py-2 font-medium">已发</th><th className="px-3 py-2 font-medium">可生成发货</th><th className="px-3 py-2 text-right font-medium">金额</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2"><div className="font-medium text-gray-900">{item.material.name}</div><div className="text-xs text-gray-500">{item.material.code}{item.material.spec ? ` · ${item.material.spec}` : ''}</div></td>
                              <td className="px-3 py-2">{numberText(item.qty)} {item.unit}</td>
                              <td className="px-3 py-2 text-amber-700">{numberText(item.pendingQty)} {item.unit}</td>
                              <td className="px-3 py-2 text-emerald-700">{numberText(item.shippedQty)} {item.unit}</td>
                              <td className="px-3 py-2 font-medium text-blue-700">{numberText(item.remainingQty)} {item.unit}</td>
                              <td className="px-3 py-2 text-right">{money(item.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">{order.note || `已生成 ${order._count.shipments} 张发货单`}</div>
                      <div className="flex flex-wrap gap-2">
                        <BusinessDocumentPrintLink kind="sales-order" id={order.id} />
                        {order.status === 'DRAFT' && <AppButton size="sm" variant="primary" onClick={() => setPendingAction({ order, action: 'confirm' })}>确认订单</AppButton>}
                        {['DRAFT', 'CONFIRMED'].includes(order.status) && <AppButton size="sm" variant="secondary" onClick={() => setPendingAction({ order, action: 'cancel' })}>取消订单</AppButton>}
                        {['CONFIRMED', 'PARTIAL'].includes(order.status) && order.items.some((item) => item.remainingQty > 0) && onOpenShipment && (
                          <AppButton size="sm" variant="create" onClick={onOpenShipment}>生成发货单</AppButton>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <ModalDialog
          title="新建销售订单"
          description="先保存销售需求，确认后才能在发货管理中生成发货单。"
          size="wide"
          onClose={() => setFormOpen(false)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setFormOpen(false)} onConfirm={saveOrder} confirmLabel="创建并输出 PDF" busy={saving} />}
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
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">物料 {index + 1}</label><SearchableSelect value={line.materialId} onChange={(value) => updateLine(line.key, { materialId: value })} options={materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: item.spec || '' }))} placeholder="输入编码、名称或规格" /></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">数量 {material ? `(${material.stockUnit || material.unit})` : ''}</label><input type="number" min={0} step="any" value={line.qty || ''} onChange={(event) => updateLine(line.key, { qty: Number(event.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">单价</label><input type="number" min={0} step="0.01" value={line.unitPrice || ''} onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
                      <div><label className="mb-2 block text-xs font-medium text-gray-500">金额</label><div className="flex h-10 items-center justify-end font-medium text-gray-900">{money(line.qty * line.unitPrice)}</div></div>
                      <button type="button" aria-label="移除销售明细" title="移除" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== line.key) }))} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-25"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex justify-end text-sm"><span className="text-gray-500">订单合计</span><strong className="ml-3 text-lg text-gray-900">{money(formTotal)}</strong></div>
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
          <p className="text-sm text-gray-600">{pendingAction.action === 'confirm' ? '确认后订单明细将进入发货管理，销售订单本身不直接扣减库存。' : '取消后该订单不能再生成发货单。'}</p>
        </ModalDialog>
      )}
    </>
  )
}
