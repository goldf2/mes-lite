'use client'

import { ReactNode, useCallback, useMemo, useState, useEffect } from 'react'
import { AttachmentPanel } from '@/modules/attachments'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { BusinessDocumentDetailDialog, BusinessDocumentPrintLink } from '@/modules/business-documents'
import ShipmentCreateDialog from './ShipmentCreateDialog'
import { loadShipments, transitionShipment } from '../client/fulfillment-api'
import type { FulfillmentCustomer, Shipment } from '../contracts/fulfillment'
import {
  shipmentStatusColors as statusColors,
  shipmentStatusLabels as statusLabels,
  shipmentStatusOptions as statusOptions,
} from '../model/fulfillment-view'

export default function ShipmentPageModule({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [customers, setCustomers] = useState<FulfillmentCustomer[]>([])
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
  const fetchShipments = useCallback(async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const data = await loadShipments(params)
      setShipments(data.shipments)
      setCustomers(data.customers)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取发货单列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, selectedCustomerId, selectedStatuses])

  useEffect(() => {
    void fetchShipments()
  }, [fetchShipments])

  const handleAction = async (id: string, action: 'ship' | 'deliver') => {
    setLoading(true)
    try {
      const data = await transitionShipment(id, action)
      onMessage(data.message || '操作成功')
      await fetchShipments()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setLoading(false)
    }
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
              onClick={() => setShowModal(true)}
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
                onClick={() => setShowModal(true)}
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
                    <div className="mt-1 text-xs text-gray-500">来源：{item.salesOrder?.orderNo || '独立发货'}</div>
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">来源销售订单</th>
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
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{item.salesOrder?.orderNo || '独立发货'}</td>
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
          description={`来源：${detailItem.salesOrder?.orderNo || '独立发货'} · ${statusLabels[detailItem.status] || detailItem.status}`}
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
        <ShipmentCreateDialog
          onClose={() => setShowModal(false)}
          onCreated={fetchShipments}
          onMessage={onMessage}
        />
      )}
      </div>
    </>
  )
}
