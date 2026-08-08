'use client'

import { ReactNode, useMemo, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import SearchableSelect from './SearchableSelect'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import { MappedResourceAdvancedSearch } from './resource'
import BusinessDocumentPrintLink, { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from './BusinessDocumentPrintLink'
import BusinessDocumentDetailDialog from './BusinessDocumentDetailDialog'

interface ShippableSalesItem {
  id: string
  salesOrderId: string
  qty: number
  shippedQty: number
  pendingQty: number
  remainingQty: number
  unit: string
  unitPrice: number
  salesOrder: {
    id: string
    orderNo: string
    voucherNo?: string | null
    customer: Customer
  }
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    stockUnit: string
    unit: string
    stock?: {
      availableQty: number
      locationBalances: Array<{ locationId: string; availableQty: number }>
    } | null
  }
}

interface InventoryLocation {
  id: string
  code: string
  name: string
  isDefault: boolean
}

interface Customer {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
}

interface Shipment {
  id: string
  shipmentNo: string
  voucherNo?: string | null
  productId: string
  locationId?: string | null
  customerId?: string | null
  qty: number
  unitPrice: number
  totalAmount: number
  customer: string
  customerPhone?: string
  address?: string
  status: string
  shippedAt?: string
  shippedBy?: string
  trackingNo?: string
  note?: string
  createdAt: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  customerRef?: { id: string; code: string; name: string } | null
  location?: { id: string; code: string; name: string } | null
  salesOrder?: { id: string; orderNo: string; voucherNo?: string | null } | null
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待发货',
  SHIPPED: '已发货',
  DELIVERED: '已签收',
  CANCELLED: '已取消',
}

const statusOptions = [
  { value: 'PENDING', label: '待发货' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'DELIVERED', label: '已签收' },
  { value: 'CANCELLED', label: '已取消' },
]

export default function ShipmentPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [shippableItems, setShippableItems] = useState<ShippableSalesItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [detailItem, setDetailItem] = useState<Shipment | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.shipment.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
  ], [customers, selectedCustomerId, selectedStatuses])

  const [form, setForm] = useState({
    salesOrderItemId: '',
    locationId: '',
    qty: 0,
    trackingNo: '',
    shippedBy: '',
    note: '',
  })
  const shipmentSort = useClientTableSort(shipments, {
    shipmentNo: (item) => item.shipmentNo,
    voucherNo: (item) => item.voucherNo,
    material: (item) => `${item.product?.sku || ''} ${item.product?.name || ''}`,
    location: (item) => item.location ? `${item.location.code} ${item.location.name}` : null,
    qty: (item) => item.qty,
    unitPrice: (item) => item.unitPrice,
    totalAmount: (item) => item.totalAmount,
    customer: (item) => item.customer,
    status: (item) => statusLabels[item.status] || item.status,
    shippedAt: (item) => item.shippedAt ? new Date(item.shippedAt) : null,
  }, 'shipmentNo', 'desc')
  const selectedSalesItem = shippableItems.find((item) => item.id === form.salesOrderItemId)
  const selectedLocationBalance = selectedSalesItem?.material.stock?.locationBalances.find((item) => item.locationId === form.locationId)

  useEffect(() => {
    fetchShipments()
    fetchShippableItems()
    fetchCustomers()
    fetchLocations()
  }, [keyword, selectedStatuses, selectedCustomerId])

  const fetchShipments = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/shipments?${params.toString()}` : '/api/shipments'
      const res = await fetch(url)
      const data = await res.json()
      setShipments(data.data || [])
    } catch (err) {
      onMessage('获取发货单列表失败')
    }
    setLoading(false)
  }

  const fetchShippableItems = async () => {
    try {
      const res = await fetch('/api/sales-orders/shippable')
      if (res.ok) {
        const data = await res.json()
        setShippableItems(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/sales-orders/options')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
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
      const options = data.data || []
      setLocations(options)
      setForm((current) => current.locationId ? current : {
        ...current,
        locationId: options.find((item: InventoryLocation) => item.isDefault)?.id || options[0]?.id || '',
      })
    } catch {
      // 提交接口会校验库位
    }
  }

  const resetForm = () => {
    setForm({
      salesOrderItemId: '',
      locationId: locations.find((item) => item.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      trackingNo: '',
      shippedBy: '',
      note: '',
    })
  }

  const openCreate = async () => {
    resetForm()
    await Promise.all([fetchShippableItems(), fetchLocations()])
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.salesOrderItemId || !form.locationId || form.qty <= 0) {
      onMessage('请选择销售订单明细和发货库位，并填写数量')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesOrderItemId: form.salesOrderItemId,
          locationId: form.locationId,
          qty: form.qty,
          trackingNo: form.trackingNo || undefined,
          shippedBy: form.shippedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`发货单创建成功：${data.data.shipmentNo}`)
        const pdfGenerated = await generateBusinessDocumentPdfArchives('shipment', [data.data.id])
        if (pdfGenerated) printPreview.open('shipment', data.data.id)
        else {
          printPreview.close()
          onMessage('发货单已创建，但 PDF 生成失败，可在发货列表中重新打印')
        }
        setShowModal(false)
        resetForm()
        await Promise.all([fetchShipments(), fetchShippableItems()])
      } else {
        printPreview.close()
        onMessage(data.error || '创建发货单失败')
      }
    } catch (err) {
      printPreview.close()
      onMessage('创建发货单失败')
    }
    setLoading(false)
  }

  const handleSalesItemChange = (salesOrderItemId: string) => {
    const item = shippableItems.find((option) => option.id === salesOrderItemId)
    const bestBalance = item?.material.stock?.locationBalances
      .filter((balance) => locations.some((location) => location.id === balance.locationId))
      .sort((left, right) => Number(right.availableQty) - Number(left.availableQty))[0]
    const defaultLocationId = bestBalance?.locationId || locations.find((location) => location.isDefault)?.id || locations[0]?.id || ''
    setForm({
      ...form,
      salesOrderItemId,
      locationId: defaultLocationId,
      qty: Number(item?.remainingQty || 0),
    })
  }

  const handleAction = async (id: string, action: 'ship' | 'deliver') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shipments/${id}/${action}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '操作成功')
        await Promise.all([fetchShipments(), fetchShippableItems()])
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
            storageKey="mes-lite.searchPresets.shipments"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索发货单号、物料、客户或物流号"
          />
        )}
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            <AppButton
              variant="create"
              onClick={openCreate}
            >
              新建发货单
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
              storageKey="mes-lite.searchPresets.shipments"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索发货单号、物料、客户或物流号"
            />
          )}
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              <AppButton
                variant="create"
                onClick={openCreate}
              >
                新建发货单
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-3 sm:p-6">
        {shipments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 sm:py-12">
            <p className="text-4xl mb-4">🚚</p>
            <p>暂无发货单</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {shipmentSort.sortedRows.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.shipmentNo}</div>
                    <div className="mt-1 text-xs text-gray-500">销售订单：{item.salesOrder?.orderNo || '历史发货单'}</div>
                    <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '未发货'}</div>
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
                    <div className="mt-1 text-xs text-blue-700">库位：{item.location ? `${item.location.code} · ${item.location.name}` : '默认库位'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">客户</div>
                    <div className="mt-1 font-medium text-gray-900">{item.customer}</div>
                    <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
                    {item.customerPhone && <div className="text-xs text-gray-500">{item.customerPhone}</div>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">数量</div>
                    <div className="mt-1 font-semibold">{item.qty}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">单价</div>
                    <div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(2)}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">金额</div>
                    <div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                  </div>
                </div>
                {(item.address || item.trackingNo || item.note) && (
                  <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                    {item.address && <div>地址：{item.address}</div>}
                    {item.trackingNo && <div className="mt-1">物流：{item.trackingNo}</div>}
                    {item.note && <div className="mt-1">备注：{item.note}</div>}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                    <BusinessDocumentPrintLink kind="shipment" id={item.id} />
                    {item.status === 'PENDING' && (
                      <button
                        onClick={() => handleAction(item.id, 'ship')}
                        disabled={loading}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        发货
                      </button>
                    )}
                    {item.status === 'SHIPPED' && (
                      <button
                        onClick={() => handleAction(item.id, 'deliver')}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                      >
                        签收
                      </button>
                    )}
                    {(item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
                      <a
                        href={`/api/shipments/${item.id}/delivery-note`}
                        className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                      >
                        下载发货单 PDF
                      </a>
                    )}
                    {item.status === 'CANCELLED' && (
                      <span className="text-xs text-gray-400">无操作</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px]">
              <thead className="bg-gray-50">
                <tr>
                  <SortableTableHeader column="shipmentNo" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>发货单号</SortableTableHeader>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">销售订单</th>
                  <SortableTableHeader column="voucherNo" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>凭据号</SortableTableHeader>
                  <SortableTableHeader column="material" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>物料</SortableTableHeader>
                  <SortableTableHeader column="location" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>发货库位</SortableTableHeader>
                  <SortableTableHeader column="qty" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>数量</SortableTableHeader>
                  <SortableTableHeader column="unitPrice" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>单价</SortableTableHeader>
                  <SortableTableHeader column="totalAmount" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>总金额</SortableTableHeader>
                  <SortableTableHeader column="customer" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>客户</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>状态</SortableTableHeader>
                  <SortableTableHeader column="shippedAt" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>发货日期</SortableTableHeader>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipmentSort.sortedRows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.shipmentNo}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{item.salesOrder?.orderNo || '历史单据'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.product?.name}</div>
                      <div className="text-xs text-gray-500">{item.product?.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.location ? <><div>{item.location.name}</div><div className="font-mono text-xs text-gray-500">{item.location.code}</div></> : '默认库位'}</td>
                    <td className="px-4 py-3">{item.qty}</td>
                    <td className="px-4 py-3">¥{item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
	                    <td className="px-4 py-3">
	                      <div className="font-medium">{item.customer}</div>
	                      <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
	                      {item.customerPhone && (
	                        <div className="text-xs text-gray-500">{item.customerPhone}</div>
	                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                        <BusinessDocumentPrintLink kind="shipment" id={item.id} />
                        {item.status === 'PENDING' && (
                          <button
                            onClick={() => handleAction(item.id, 'ship')}
                            disabled={loading}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            发货
                          </button>
                        )}
                        {item.status === 'SHIPPED' && (
                          <button
                            onClick={() => handleAction(item.id, 'deliver')}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                          >
                            签收
                          </button>
                        )}
                        {(item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
                          <a
                            href={`/api/shipments/${item.id}/delivery-note`}
                            className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                          >
                            下载发货单 PDF
                          </a>
                        )}
                        {item.status === 'CANCELLED' && (
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
          title={`发货单 ${detailItem.shipmentNo}`}
          description={`销售订单：${detailItem.salesOrder?.orderNo || '历史单据'} · ${statusLabels[detailItem.status] || detailItem.status}`}
          ownerType="SHIPMENT"
          ownerId={detailItem.id}
          onClose={() => setDetailItem(null)}
          onMessage={onMessage}
          headerActions={<BusinessDocumentPrintLink kind="shipment" id={detailItem.id} />}
        >
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-gray-500">物料</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.product?.name}</dd><dd className="text-xs text-gray-500">{detailItem.product?.sku}</dd></div>
            <div><dt className="text-gray-500">客户</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.customer}</dd><dd className="text-xs text-gray-500">{detailItem.customerPhone || '-'}</dd></div>
            <div><dt className="text-gray-500">发货库位</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.location ? `${detailItem.location.code} · ${detailItem.location.name}` : '默认库位'}</dd></div>
            <div><dt className="text-gray-500">物流单号</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.trackingNo || '-'}</dd></div>
            <div><dt className="text-gray-500">数量</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.qty}</dd></div>
            <div><dt className="text-gray-500">金额</dt><dd className="mt-1 font-medium text-gray-900">¥{detailItem.totalAmount.toFixed(2)}</dd></div>
            <div><dt className="text-gray-500">发货时间</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.shippedAt ? new Date(detailItem.shippedAt).toLocaleString('zh-CN') : '-'}</dd></div>
            <div><dt className="text-gray-500">收货地址</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.address || '-'}</dd></div>
          </dl>
        </BusinessDocumentDetailDialog>
      )}

      {showModal && (
        <ModalDialog
          title="新建发货单"
          description="发货单必须来自已确认销售订单，可按订单未发数量分批出库。"
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">销售订单明细</label>
                <SearchableSelect
                  value={form.salesOrderItemId}
                  options={shippableItems.map((item) => ({
                    value: item.id,
                    label: `${item.salesOrder.orderNo} · ${item.salesOrder.customer.name} · ${item.material.name}`,
                    keywords: `${item.salesOrder.voucherNo || ''} ${item.material.code} ${item.material.spec || ''}`,
                  }))}
                  onChange={handleSalesItemChange}
                  placeholder="输入销售订单号、客户、物料或规格筛选"
                  emptyText="没有可发货的销售订单明细"
                />
                {shippableItems.length === 0 && <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">请先在销售订单页面创建并确认订单。</div>}
              </div>
              {selectedSalesItem && (
                <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm sm:grid-cols-3">
                  <div><span className="text-blue-600">客户</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.salesOrder.customer.name}</div></div>
                  <div><span className="text-blue-600">物料</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.material.code} · {selectedSalesItem.material.name}</div></div>
                  <div><span className="text-blue-600">未发数量</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.remainingQty} {selectedSalesItem.unit}</div></div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物流单号</label>
                <input type="text" value={form.trackingNo} onChange={(e) => setForm({ ...form, trackingNo: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">发货库位</label>
                <SearchableSelect
                  value={form.locationId}
                  onChange={(locationId) => setForm({ ...form, locationId })}
                  options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
                  placeholder="输入库位编码或名称筛选"
                />
                {selectedSalesItem && (
                  <div className={`mt-2 rounded px-3 py-2 text-xs ${form.qty > Number(selectedLocationBalance?.availableQty || 0) ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                    当前可用：<strong>{selectedLocationBalance?.availableQty || 0} {selectedSalesItem.unit}</strong>；本次最多可按订单发出 {selectedSalesItem.remainingQty} {selectedSalesItem.unit}。
                    {form.qty > Number(selectedLocationBalance?.availableQty || 0) && ' 当前库位库存不足，不能生成发货单。'}
                  </div>
                )}
              </div>
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">数量{selectedSalesItem ? ` (${selectedSalesItem.unit})` : ''}</label>
                  <input
                    type="number"
                    step="any"
                    value={form.qty || ''}
                    onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                    min={0}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">发货人</label>
                <input
                  type="text"
                  value={form.shippedBy}
                  onChange={(e) => setForm({ ...form, shippedBy: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
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
