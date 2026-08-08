'use client'

import { ReactNode, useMemo, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import SearchableSelect from './SearchableSelect'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import FormField, { appInputClassName, appTextareaClassName } from './FormField'
import AppButton from './AppButton'
import { MappedResourceAdvancedSearch } from './resource'
import BusinessDocumentPrintLink, { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from './BusinessDocumentPrintLink'

interface MaterialChoice {
  id: string
  sku: string
  name: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
}

interface Customer {
  id: string
  code: string
  name: string
}

interface InventoryLocation {
  id: string
  code: string
  name: string
  isDefault: boolean
}

interface ReturnOrder {
  id: string
  returnNo: string
  voucherNo?: string | null
  shipmentId?: string
  productId: string
  qty: number
  reason: string
  status: string
  note?: string
  createdAt: string
  processedAt?: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  shipment?: { id: string; shipmentNo: string; customerId?: string | null; customerRef?: { id: string; code: string; name: string } | null } | null
  location?: InventoryLocation | null
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  PROCESSED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待处理',
  PROCESSED: '已处理',
  REJECTED: '已拒绝',
}

const statusOptions = [
  { value: 'PENDING', label: '待处理' },
  { value: 'PROCESSED', label: '已处理' },
  { value: 'REJECTED', label: '已拒绝' },
]

export default function ReturnPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [returns, setReturns] = useState<ReturnOrder[]>([])
  const [products, setProducts] = useState<MaterialChoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.return.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
  ], [customers, selectedCustomerId, selectedStatuses])

  const [form, setForm] = useState({
    voucherNo: '',
    productId: '',
    locationId: '',
    qty: 0,
    reason: '',
    note: '',
  })
  const returnSort = useClientTableSort(returns, {
    returnNo: (item) => item.returnNo,
    voucherNo: (item) => item.voucherNo,
    shipment: (item) => item.shipment?.shipmentNo,
    material: (item) => `${item.product?.sku || ''} ${item.product?.name || ''}`,
    qty: (item) => item.qty,
    location: (item) => item.location ? `${item.location.code} ${item.location.name}` : null,
    reason: (item) => item.reason,
    status: (item) => statusLabels[item.status] || item.status,
    createdAt: (item) => new Date(item.createdAt),
  }, 'createdAt', 'desc')
  const selectedProduct = products.find((item) => item.id === form.productId)

  useEffect(() => {
    fetchReturns()
    fetchProducts()
    fetchCustomers()
    fetchLocations()
  }, [keyword, selectedStatuses, selectedCustomerId])

  const fetchReturns = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/returns?${params.toString()}` : '/api/returns'
      const res = await fetch(url)
      const data = await res.json()
      setReturns(data.data || [])
    } catch (err) {
      onMessage('获取退货单列表失败')
    }
    setLoading(false)
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

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/inventory-locations')
      if (!res.ok) return
      const data = await res.json()
      const nextLocations = data.data || []
      setLocations(nextLocations)
      setForm((current) => current.locationId ? current : {
        ...current,
        locationId: nextLocations.find((location: InventoryLocation) => location.isDefault)?.id || nextLocations[0]?.id || '',
      })
    } catch (err) {
      // ignore
    }
  }

  const resetForm = () => {
    setForm({
      voucherNo: '',
      productId: '',
      locationId: locations.find((location) => location.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      reason: '',
      note: '',
    })
  }

  const handleSubmit = async () => {
    if (!form.productId || !form.locationId || form.qty <= 0 || !form.reason) {
      onMessage('请选择物料和退回库位，并填写数量和退货原因')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          locationId: form.locationId,
          voucherNo: form.voucherNo || undefined,
          qty: form.qty,
          reason: form.reason,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`退货单创建成功：${data.data.returnNo}`)
        const pdfGenerated = await generateBusinessDocumentPdfArchives('return', [data.data.id])
        if (pdfGenerated) printPreview.open('return', data.data.id)
        else {
          printPreview.close()
          onMessage('退货单已创建，但 PDF 生成失败，可在退货列表中重新打印')
        }
        setShowModal(false)
        resetForm()
        await fetchReturns()
      } else {
        printPreview.close()
        onMessage(data.error || '创建退货单失败')
      }
    } catch (err) {
      printPreview.close()
      onMessage('创建退货单失败')
    }
    setLoading(false)
  }

  const handleAction = async (id: string, action: 'process' | 'reject') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/returns/${id}/${action}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '操作成功')
        await fetchReturns()
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
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.returns"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索退货单号、物料、发货单或原因"
          />
        )}
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            <AppButton
              variant="create"
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
            >
              新建退货单
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, onToolbarChange, keyword, selectedStatuses, selectedCustomerId, customers, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.returns"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索退货单号、物料、发货单或原因"
            />
          )}
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              <AppButton
                variant="create"
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
              >
                新建退货单
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-3 sm:p-6">
        {returns.length === 0 ? (
          <div className="text-center py-8 text-gray-500 sm:py-12">
            <p className="text-4xl mb-4">↩️</p>
            <p>暂无退货单</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {returnSort.sortedRows.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.returnNo}</div>
                    <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
                    <div className="mt-1 text-xs text-gray-500">关联发货单：{item.shipment?.shipmentNo || '-'}</div>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                    {statusLabels[item.status] || item.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 sm:mt-4">
                  <div>
                    <div className="text-xs text-gray-500">物料</div>
                    <div className="mt-1 font-medium text-gray-900">{item.product?.name}</div>
                    <div className="text-xs text-gray-500">{item.product?.sku}</div>
                    <div className="text-xs text-gray-500">客户：{item.shipment?.customerRef?.name || item.product?.customer?.name || '通用/未绑定'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">退货信息</div>
                    <div className="mt-1 font-medium text-gray-900">数量：{item.qty}</div>
                    <div className="text-xs text-gray-500">退回库位：{item.location ? `${item.location.code} · ${item.location.name}` : '-'}</div>
                    <div className="text-xs text-gray-500">创建：{new Date(item.createdAt).toLocaleString('zh-CN')}</div>
                    {item.processedAt && <div className="text-xs text-gray-500">处理：{new Date(item.processedAt).toLocaleString('zh-CN')}</div>}
                  </div>
                </div>
                <div className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="text-xs text-gray-500">退货原因</div>
                  <div className="mt-1">{item.reason}</div>
                  {item.note && <div className="mt-2 text-xs text-gray-500">备注：{item.note}</div>}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="RETURN_ORDER" ownerId={item.id} compact onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    <BusinessDocumentPrintLink kind="return" id={item.id} />
                    {item.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleAction(item.id, 'process')}
                          disabled={loading}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                        >
                          处理
                        </button>
                        <button
                          onClick={() => handleAction(item.id, 'reject')}
                          disabled={loading}
                          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                        >
                          拒绝
                        </button>
                      </>
                    )}
                    {item.status !== 'PENDING' && (
                      <span className="text-xs text-gray-400">无操作</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-gray-50">
                <tr>
                  <SortableTableHeader column="returnNo" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>退货单号</SortableTableHeader>
                  <SortableTableHeader column="voucherNo" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>凭据号</SortableTableHeader>
                  <SortableTableHeader column="shipment" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>关联发货单</SortableTableHeader>
                  <SortableTableHeader column="material" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>物料</SortableTableHeader>
                  <SortableTableHeader column="qty" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>数量</SortableTableHeader>
                  <SortableTableHeader column="location" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>退回库位</SortableTableHeader>
                  <SortableTableHeader column="reason" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>退货原因</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>状态</SortableTableHeader>
                  <SortableTableHeader column="createdAt" activeColumn={returnSort.sortColumn} direction={returnSort.sortDirection} onSort={returnSort.toggleSort}>创建时间</SortableTableHeader>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {returnSort.sortedRows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.returnNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {item.shipment?.shipmentNo || '-'}
                    </td>
	                    <td className="px-4 py-3">
	                      <div className="font-medium">{item.product?.name}</div>
	                      <div className="text-xs text-gray-500">{item.product?.sku}</div>
	                      <div className="text-xs text-gray-500">
	                        客户：{item.shipment?.customerRef?.name || item.product?.customer?.name || '通用/未绑定'}
	                      </div>
	                    </td>
                    <td className="px-4 py-3">{item.qty}</td>
                    <td className="px-4 py-3 text-sm">{item.location ? `${item.location.code} · ${item.location.name}` : '-'}</td>
                    <td className="px-4 py-3 text-sm">{item.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="RETURN_ORDER" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <BusinessDocumentPrintLink kind="return" id={item.id} compact />
                      {item.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(item.id, 'process')}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                          >
                            处理
                          </button>
                          <button
                            onClick={() => handleAction(item.id, 'reject')}
                            disabled={loading}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                      {item.status !== 'PENDING' && (
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
          title="新建退货单"
          description="登记退回物料、数量和实际接收库位。"
          onClose={() => setShowModal(false)}
          closeDisabled={loading}
          footer={(
            <ModalActions
              onCancel={() => setShowModal(false)}
              onConfirm={handleSubmit}
              confirmLabel="创建并输出 PDF"
              busy={loading}
            />
          )}
        >
            <div className="space-y-4">
              <FormField label="凭据号" hint="可填写客户退货单号、外部凭据号或纸质单号。">
                <input
                  type="text"
                  value={form.voucherNo}
                  onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  placeholder="客户退货单号、外部凭据号或纸质单号"
                  className={appInputClassName}
                />
              </FormField>
              <FormField label="物料" required>
                <MaterialChoiceSearch
                  value={form.productId}
                  options={products}
                  onChange={(productId) => setForm({ ...form, productId })}
                  placeholder="输入物料编码、名称或客户筛选"
                />
              </FormField>
              <FormField label={`数量${selectedProduct ? `（${selectedProduct.unit}）` : ''}`} required>
                <input
                  type="number"
                  step="any"
                  value={form.qty || ''}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  min={0}
                  className={appInputClassName}
                />
              </FormField>
              <FormField label="退回库位" required hint="退货处理后，库存会进入所选库位。">
                <SearchableSelect
                  value={form.locationId}
                  onChange={(locationId) => setForm({ ...form, locationId })}
                  options={locations.map((location) => ({
                    value: location.id,
                    label: `${location.code} · ${location.name}${location.isDefault ? '（默认）' : ''}`,
                  }))}
                  placeholder="输入库位编码或名称筛选"
                />
              </FormField>
              <FormField label="退货原因" required>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="请填写退货原因"
                  className={appTextareaClassName}
                />
              </FormField>
              <FormField label="备注">
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className={appTextareaClassName}
                />
              </FormField>
            </div>
        </ModalDialog>
      )}
      </div>
    </>
  )
}
