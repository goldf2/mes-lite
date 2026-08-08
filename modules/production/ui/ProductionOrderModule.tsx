'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SearchableSelect from '@/app/components/SearchableSelect'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import BusinessDocumentPrintLink, {
  generateBusinessDocumentPdfArchives,
  reserveBusinessDocumentPrintWindow,
} from '@/app/components/BusinessDocumentPrintLink'
import DraftDocumentAttachmentPanel, {
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/app/components/DraftDocumentAttachmentPanel'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'

const AttachmentPanel = dynamic(() => import('@/app/components/AttachmentPanel'), { loading: () => <AppLoadingIndicator label="正在加载附件..." /> })
const ProductionOrderActualPanel = dynamic(() => import('@/app/components/ProductionOrderActualPanel'), { loading: () => <AppLoadingIndicator label="正在加载生产实绩..." /> })

export type ProductionOrderMode = 'orders' | 'create' | 'detail'

interface MaterialOption {
  id: string
  code: string
  name: string
  category: string
}

interface OrderBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
}

interface OrderMaterialOption extends MaterialOption {
  boms: OrderBomOption[]
}

interface ProductionOrder {
  id: string
  orderNo: string
  groupNo?: string | null
  lineNo?: number
  voucherNo?: string | null
  status: string
  planQty: number
  completeQty: number
  scrapQty: number
  createdAt: string
  product: { id: string; name: string; sku: string }
  targetMaterial?: { id: string; name: string; code: string; category?: string; stockUnit?: string; unit?: string } | null
  bom?: { id: string; name: string; version: string } | null
  bomName?: string | null
  bomVersion?: string | null
  _count: { reports: number; picks: number; actuals: number }
}

interface ProductionOrderDetail extends ProductionOrder {
  groupLines?: ProductionOrder[]
}

interface OrderDraftLine {
  id: string
  targetId: string
  bomId: string
  planQty: number
}

interface ProductionOrderModuleProps {
  mode: ProductionOrderMode
  canCreate: boolean
  onModeChange: (mode: ProductionOrderMode) => void
  onMessage: (message: string) => void
  onStateSummaryChange?: (summary: string) => void
}

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料',
  DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他',
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
  DRAFT: '草稿', CONFIRMED: '已确认', PICKED: '已领料', RUNNING: '生产中',
  QC_WAITING: '待质检', QC_DONE: '质检完成', COMPLETED: '已完成', CANCELLED: '已取消',
}

const orderStatusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }))

function displayMaterialCode(code?: string | null) {
  return code?.startsWith('MAT-') ? code.slice(4) : code || ''
}

function readInitialQuery() {
  if (typeof window === 'undefined') return ''
  return new URL(window.location.href).searchParams.get('q') || ''
}

function readInitialStatuses() {
  if (typeof window === 'undefined') return orderStatusOptions.map((option) => option.value)
  const url = new URL(window.location.href)
  const requested = (url.searchParams.get('statuses') || '')
    .split(',')
    .filter((value) => orderStatusOptions.some((option) => option.value === value))
  return requested.length > 0 ? requested : orderStatusOptions.map((option) => option.value)
}

export default function ProductionOrderModule({
  mode,
  canCreate,
  onModeChange,
  onMessage,
  onStateSummaryChange,
}: ProductionOrderModuleProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [orderDetail, setOrderDetail] = useState<ProductionOrderDetail | null>(null)
  const [orderMaterialOptions, setOrderMaterialOptions] = useState<OrderMaterialOption[]>([])
  const [planQty, setPlanQty] = useState(100)
  const [orderVoucherNo, setOrderVoucherNo] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedOrderBomId, setSelectedOrderBomId] = useState('')
  const [orderDraftLines, setOrderDraftLines] = useState<OrderDraftLine[]>([])
  const [orderKeyword, setOrderKeyword] = useState(readInitialQuery)
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState<string[]>(readInitialStatuses)
  const [orderViewMode, setOrderViewMode] = usePersistedViewMode('mes-lite.orders.viewMode', 'card')
  const [loading, setLoading] = useState(false)
  const [draftAttachmentOwnerId, setDraftAttachmentOwnerId] = useState('')
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)

  const selectedOrderMaterial = orderMaterialOptions.find((material) => material.id === selectedMaterialId) || null
  const selectedOrderBoms = useMemo(() => selectedOrderMaterial?.boms || [], [selectedOrderMaterial])
  const advancedSearchFields = useMemo(() => [{
    key: 'status',
    label: '订单状态',
    value: selectedOrderStatuses.length === 1 ? selectedOrderStatuses[0] : '',
    onChange: (value: string) => setSelectedOrderStatuses(value ? [value] : orderStatusOptions.map((option) => option.value)),
    options: orderStatusOptions,
  }], [selectedOrderStatuses])

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams(getStatusQuery(selectedOrderStatuses, orderStatusOptions))
    if (orderKeyword.trim()) params.set('keyword', orderKeyword.trim())
    const response = await fetch(`/api/orders${params.toString() ? `?${params.toString()}` : ''}`)
    const payload = await response.json()
    setOrders(payload.data || [])
  }, [orderKeyword, selectedOrderStatuses])

  useEffect(() => {
    const requestedView = new URL(window.location.href).searchParams.get('view')
    if (requestedView === 'card' || requestedView === 'list') setOrderViewMode(requestedView)
  }, [setOrderViewMode])

  useEffect(() => {
    if (selectedOrderBoms.some((bom) => bom.id === selectedOrderBomId)) return
    const preferred = selectedOrderBoms.find((bom) => bom.isDefault) || selectedOrderBoms[0]
    setSelectedOrderBomId(preferred?.id || '')
  }, [selectedOrderBomId, selectedOrderBoms])

  useEffect(() => {
    onStateSummaryChange?.(`视图：${orderViewMode === 'card' ? '卡片' : '列表'} · 状态筛选：${selectedOrderStatuses.length} 项`)
  }, [onStateSummaryChange, orderViewMode, selectedOrderStatuses.length])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', orderViewMode)
    if (orderKeyword.trim()) url.searchParams.set('q', orderKeyword.trim())
    else url.searchParams.delete('q')
    if (selectedOrderStatuses.length !== orderStatusOptions.length) url.searchParams.set('statuses', selectedOrderStatuses.join(','))
    else url.searchParams.delete('statuses')
    window.history.replaceState(window.history.state, '', url)
  }, [orderKeyword, orderViewMode, selectedOrderStatuses])

  useEffect(() => {
    if (mode !== 'orders') return
    void fetchOrders()
  }, [fetchOrders, mode])

  useEffect(() => {
    if (mode !== 'create' || orderMaterialOptions.length > 0) return
    void fetchMaterialOptions()
  }, [mode, orderMaterialOptions.length])

  useEffect(() => {
    if (mode === 'create') {
      setDraftAttachmentOwnerId((current) => current || createDraftDocumentAttachmentId())
      return
    }
    if (!draftAttachmentOwnerId) return
    const staleDraftOwnerId = draftAttachmentOwnerId
    void discardDraftDocumentAttachments('PRODUCTION_ORDER', staleDraftOwnerId)
      .finally(() => setDraftAttachmentOwnerId((current) => current === staleDraftOwnerId ? '' : current))
  }, [draftAttachmentOwnerId, mode])

  async function fetchMaterialOptions() {
    const response = await fetch('/api/orders/options')
    if (!response.ok) return
    const payload = await response.json()
    setOrderMaterialOptions(payload.data || [])
  }

  async function fetchOrderDetail(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}`)
    const payload = await response.json()
    setOrderDetail(payload.data || null)
  }

  async function openOrderDetail(order: ProductionOrder) {
    await fetchOrderDetail(order.id)
    onModeChange('detail')
  }

  async function applyRecognizedProductionOrder(fields: Record<string, unknown>) {
    const material = recognizedText(fields, 'material')
    const matchedMaterial = orderMaterialOptions.find((option) => matchesRecognizedValue(material, [option.code, option.name]))
    const matchedBomText = recognizedText(fields, 'bom')
    const matchedBom = matchedMaterial?.boms.find((bom) => matchesRecognizedValue(matchedBomText, [bom.name, bom.version]))
      || matchedMaterial?.boms.find((bom) => bom.isDefault)
      || matchedMaterial?.boms[0]
    const qty = recognizedNumber(fields, 'qty')
    setOrderVoucherNo((current) => recognizedText(fields, 'voucherNo') || current)
    setOrderNote((current) => recognizedText(fields, 'note') || current)
    if (matchedMaterial) setSelectedMaterialId(matchedMaterial.id)
    if (matchedBom) setSelectedOrderBomId(matchedBom.id)
    if (qty > 0) setPlanQty(qty)
  }

  async function createOrder() {
    if (draftAttachmentBusy) {
      onMessage('请等待附件上传或 AI 识别完成')
      return
    }
    let lines = [...orderDraftLines]
    if (selectedMaterialId) {
      if (!selectedOrderBomId || planQty <= 0) {
        onMessage('请为当前产品选择 BOM 方案并输入有效计划数量')
        return
      }
      if (lines.some((line) => line.targetId === selectedMaterialId)) {
        onMessage('当前产品已经在订单明细中')
        return
      }
      lines = [...lines, { id: 'current', targetId: selectedMaterialId, bomId: selectedOrderBomId, planQty }]
    }
    if (lines.length === 0) {
      onMessage('请至少添加一个产品')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(({ id: _id, ...line }) => line),
          voucherNo: orderVoucherNo || undefined,
          note: orderNote || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        printPreview.close()
        onMessage(payload.error || '创建失败')
        return
      }
      try {
        await finalizeDraftDocumentAttachments({
          ownerType: 'PRODUCTION_ORDER',
          draftOwnerId: draftAttachmentOwnerId,
          targetOwnerId: payload.data.id,
        })
      } catch (error) {
        onMessage(error instanceof Error ? `生产订单已创建，但${error.message}` : '生产订单已创建，但附件绑定失败')
      }
      onMessage(payload.count > 1 ? `生产订单已保存：${payload.groupNo}，共 ${payload.count} 个产品` : `生产订单已保存：${payload.data.orderNo}`)
      const pdfGenerated = await generateBusinessDocumentPdfArchives(
        'production-order',
        (payload.items || [payload.data]).map((item: { id: string }) => item.id),
      )
      if (pdfGenerated) printPreview.open('production-order', payload.data.id)
      else {
        printPreview.close()
        onMessage('生产订单已保存，但部分 PDF 生成失败，可在生产订单列表中重新打印')
      }
      setPlanQty(100)
      setOrderVoucherNo('')
      setOrderNote('')
      setSelectedMaterialId('')
      setSelectedOrderBomId('')
      setOrderDraftLines([])
      setDraftAttachmentOwnerId('')
      await fetchOrders()
      onModeChange('orders')
    } catch {
      printPreview.close()
      onMessage('创建失败')
    } finally {
      setLoading(false)
    }
  }

  function addOrderDraftLine() {
    if (!selectedMaterialId || !selectedOrderBomId || planQty <= 0) {
      onMessage('请选择产品、BOM 方案并输入有效计划数量')
      return
    }
    if (orderDraftLines.some((line) => line.targetId === selectedMaterialId)) {
      onMessage('当前产品已经在订单明细中')
      return
    }
    setOrderDraftLines((current) => [...current, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      targetId: selectedMaterialId,
      bomId: selectedOrderBomId,
      planQty,
    }])
    setSelectedMaterialId('')
    setSelectedOrderBomId('')
    setPlanQty(100)
    onMessage('产品已加入订单，可继续添加')
  }

  const orderSort = useClientTableSort(orders, {
    orderNo: (order) => order.groupNo || order.orderNo,
    voucherNo: (order) => order.voucherNo,
    target: (order) => `${order.targetMaterial?.code || order.product.sku} ${order.targetMaterial?.name || order.product.name}`,
    planQty: (order) => order.planQty,
    completed: (order) => order.completeQty,
    status: (order) => statusLabels[order.status] || order.status,
    createdAt: (order) => new Date(order.createdAt),
  }, 'createdAt', 'desc')
  const orderCardGroups = Array.from(orderSort.sortedRows.reduce((groups, order) => {
    const key = order.groupNo || order.orderNo
    const current = groups.get(key) || []
    current.push(order)
    groups.set(key, current)
    return groups
  }, new Map<string, ProductionOrder[]>())).map(([groupNo, lines]) => ({
    groupNo,
    lines: [...lines].sort((left, right) => Number(left.lineNo || 1) - Number(right.lineNo || 1)),
  }))

  return (
    <>
      <TopBarPortal>
        {mode === 'orders' ? (
          <ResponsiveToolbarActions
            pageKey="orders"
            primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.orders" value={orderKeyword} onChange={setOrderKeyword} placeholder="搜索生产订单号、凭据号或物料" />}
            advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
            viewControl={<ViewModeToggle value={orderViewMode} onChange={setOrderViewMode} />}
            actions={canCreate ? <AppButton variant="create" onClick={() => onModeChange('create')}>新建生产订单</AppButton> : null}
          />
        ) : (
          <ResponsiveToolbarActions pageKey={mode} actions={<AppButton onClick={() => onModeChange('orders')}>返回生产订单</AppButton>} />
        )}
      </TopBarPortal>

      {mode === 'orders' && (
        <div className="rounded-lg bg-white p-3 shadow sm:p-6">
          {orders.length === 0 ? (
            <div className="py-8 text-center text-gray-500 sm:py-12">
              <p className="mb-4">暂无生产订单</p>
              {canCreate && <AppButton variant="create" onClick={() => onModeChange('create')}>新建生产订单</AppButton>}
            </div>
          ) : orderViewMode === 'card' ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {orderCardGroups.map((group) => {
                const first = group.lines[0]
                return (
                  <div key={group.groupNo} className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold text-blue-700">{group.groupNo}</div>
                        <div className="mt-1 text-xs text-gray-500">凭据号：{first.voucherNo || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">{new Date(first.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{group.lines.length} 个产品</span>
                        <div onClick={(event) => event.stopPropagation()}>
                          <AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={first.id} compact compactMode="summary" onMessage={onMessage} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                      {group.lines.map((order) => (
                        <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{order.targetMaterial?.name || order.product.name}</div>
                            <div className="mt-0.5 text-xs text-gray-500">{order.targetMaterial?.code || displayMaterialCode(order.product.sku)} · BOM {order.bom?.name || order.bomName || '-'} {order.bom?.version || order.bomVersion || ''}</div>
                            <div className="mt-1 text-xs text-gray-500">计划 {order.planQty} · 完成 {order.completeQty} · 报废 {order.scrapQty}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-2 py-1 text-xs font-medium ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                            <BusinessDocumentPrintLink kind="production-order" id={order.id} compact />
                            <button onClick={() => void openOrderDetail(order)} className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">详情 / 登记实绩</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                <thead className="bg-gray-50"><tr>
                  <SortableTableHeader column="orderNo" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>生产订单号</SortableTableHeader>
                  <SortableTableHeader column="voucherNo" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>凭据号</SortableTableHeader>
                  <SortableTableHeader column="target" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>目标</SortableTableHeader>
                  <SortableTableHeader column="planQty" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>计划</SortableTableHeader>
                  <SortableTableHeader column="completed" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>完成/报废</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>状态</SortableTableHeader>
                  <SortableTableHeader column="createdAt" activeColumn={orderSort.sortColumn} direction={orderSort.sortDirection} onSort={orderSort.toggleSort}>时间</SortableTableHeader>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {orderSort.sortedRows.map((order) => (
                    <tr key={order.id} className="cursor-pointer hover:bg-gray-50" onClick={() => void openOrderDetail(order)}>
                      <td className="px-4 py-3 font-mono text-sm text-blue-600">{order.groupNo || order.orderNo}{order.groupNo ? <span className="ml-1 text-xs text-gray-400">第 {order.lineNo} 项</span> : null}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{order.voucherNo || '-'}</td>
                      <td className="px-4 py-3"><div className="text-sm font-medium">{order.targetMaterial?.name || order.product.name}</div><div className="text-xs text-gray-500">物料 {order.targetMaterial?.code || displayMaterialCode(order.product.sku)}</div></td>
                      <td className="px-4 py-3 text-sm">{order.planQty}</td>
                      <td className="px-4 py-3 text-sm"><span className="text-green-600">{order.completeQty}</span><span className="mx-1 text-gray-400">/</span><span className="text-red-500">{order.scrapQty}</span></td>
                      <td className="px-4 py-3"><span className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusColors[order.status]}`}>{statusLabels[order.status]}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={order.id} compact compactMode="summary" onMessage={onMessage} /></td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2"><BusinessDocumentPrintLink kind="production-order" id={order.id} compact /><button onClick={() => void openOrderDetail(order)} className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">详情 / 登记实绩</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mode === 'detail' && orderDetail && (
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">生产订单详情</h2><span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">系统生成单据</span></div><p className="text-sm text-gray-500">{orderDetail.groupNo || orderDetail.orderNo}{orderDetail.groupNo ? ` · 第 ${orderDetail.lineNo} 项` : ''}</p><p className="text-sm text-gray-500">凭据号：{orderDetail.voucherNo || '-'}</p></div><BusinessDocumentPrintLink kind="production-order" id={orderDetail.id} /></div>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <InfoCard label="目标"><div className="font-medium">{orderDetail.targetMaterial?.name || orderDetail.product.name}</div><div className="text-xs text-gray-400">物料 {orderDetail.targetMaterial?.code || displayMaterialCode(orderDetail.product.sku)}</div></InfoCard>
            <InfoCard label="BOM 方案"><div className="font-medium">{orderDetail.bomName || orderDetail.bom?.name || '-'}</div><div className="text-xs text-gray-400">{orderDetail.bomVersion || orderDetail.bom?.version || '-'}</div></InfoCard>
            <InfoCard label="状态"><span className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusColors[orderDetail.status]}`}>{statusLabels[orderDetail.status]}</span></InfoCard>
            <InfoCard label="计划/完成"><div className="font-medium">{orderDetail.planQty} / {orderDetail.completeQty}</div></InfoCard>
            <InfoCard label="报废"><div className="font-medium text-red-600">{orderDetail.scrapQty}</div></InfoCard>
          </div>
          {(orderDetail.groupLines?.length || 0) > 1 && (
            <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
              <div className="mb-3 text-sm font-semibold text-gray-900">本订单产品</div>
              <div className="flex flex-wrap gap-2">
                {orderDetail.groupLines?.map((line) => (
                  <button key={line.id} type="button" onClick={() => void fetchOrderDetail(line.id)} className={`rounded-md border px-3 py-2 text-left text-sm ${line.id === orderDetail.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'}`}>
                    <span className="font-medium">{line.targetMaterial?.name || line.product.name}</span>
                    <span className={`ml-2 text-xs ${line.id === orderDetail.id ? 'text-blue-100' : 'text-gray-500'}`}>计划 {line.planQty}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ProductionOrderActualPanel orderId={orderDetail.id} onMessage={onMessage} onOrderChanged={async () => { await Promise.all([fetchOrderDetail(orderDetail.id), fetchOrders()]) }} />
          <div className="mt-6"><AttachmentPanel ownerType="PRODUCTION_ORDER" ownerId={orderDetail.id} title="附件管理" enableAiRecognition onMessage={onMessage} /></div>
        </div>
      )}

      {mode === 'detail' && !orderDetail && <AppLoadingIndicator label="正在加载生产订单..." />}

      {mode === 'create' && (
        <div className="max-w-4xl rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-xl font-semibold">创建生产订单</h2>
          <p className="mb-6 text-sm text-gray-500">一张订单可加入多个产品；这里不指定库位，班后登记实际投入和产出时再选择对应库位。</p>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-4 text-sm font-semibold text-gray-900">添加产品明细</div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-sm font-medium text-gray-700">主产出物料<SearchableSelect value={selectedMaterialId} onChange={setSelectedMaterialId} options={orderMaterialOptions.map((material) => ({ value: material.id, label: `${material.code} · ${material.name} · ${materialCategoryLabels[material.category] || material.category}` }))} placeholder="输入可生产物料的编码、名称或分类筛选" /><span className="mt-1 block text-xs font-normal text-gray-500">仅显示已有启用 BOM 的物料；BOM 投入可包含原材料、半成品或已有产品。</span></label>
                <label className="block text-sm font-medium text-gray-700">BOM 方案<SearchableSelect value={selectedOrderBomId} onChange={setSelectedOrderBomId} options={selectedOrderBoms.map((bom) => ({ value: bom.id, label: `${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''}` }))} placeholder={selectedMaterialId ? '输入方案名称或版本筛选' : '请先选择主产出物料'} /></label>
                <label className="block text-sm font-medium text-gray-700">计划产量<input type="number" value={planQty} onChange={(event) => setPlanQty(Number(event.target.value))} min="0.000001" step="0.000001" className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3" /></label>
              </div>
              <div className="mt-4 flex justify-end"><AppButton variant="secondary" onClick={addOrderDraftLine}>添加产品</AppButton></div>
            </div>
            {orderDraftLines.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div className="text-sm font-semibold text-gray-900">订单产品明细</div><div className="text-xs text-gray-500">已添加 {orderDraftLines.length} 项</div></div>
                <div className="space-y-2">{orderDraftLines.map((line, index) => {
                  const material = orderMaterialOptions.find((item) => item.id === line.targetId)
                  const bom = material?.boms.find((item) => item.id === line.bomId)
                  return <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm"><div className="min-w-0"><span className="mr-2 text-xs text-gray-400">{index + 1}</span><span className="font-medium text-gray-900">{material?.code} · {material?.name}</span><span className="ml-2 text-xs text-gray-500">{bom?.name} {bom?.version} · 计划 {line.planQty}</span></div><button type="button" onClick={() => setOrderDraftLines((current) => current.filter((item) => item.id !== line.id))} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">移除</button></div>
                })}</div>
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700">凭据号<input type="text" value={orderVoucherNo} onChange={(event) => setOrderVoucherNo(event.target.value)} placeholder="客户订单号、生产指令号或纸质单号" className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3" /></label>
            <label className="block text-sm font-medium text-gray-700">备注<textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} rows={3} placeholder="交期、班次、客户要求或其它生产说明" className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3" /></label>
            <DraftDocumentAttachmentPanel
              ownerType="PRODUCTION_ORDER"
              draftOwnerId={draftAttachmentOwnerId}
              onRecognized={applyRecognizedProductionOrder}
              onBusyChange={setDraftAttachmentBusy}
              onMessage={onMessage}
            />
            <button onClick={() => void createOrder()} disabled={loading || draftAttachmentBusy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{loading || draftAttachmentBusy ? '处理中...' : `创建生产订单并输出 PDF${orderDraftLines.length > 0 ? `（${orderDraftLines.length + (selectedMaterialId ? 1 : 0)} 个产品）` : ''}`}</button>
          </div>
        </div>
      )}
    </>
  )
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-gray-200 p-4"><div className="mb-1 text-sm text-gray-500">{label}</div>{children}</div>
}
