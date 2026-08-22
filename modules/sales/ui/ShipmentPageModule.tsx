'use client'

import { ReactNode, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { AttachmentPanel } from '@/modules/attachments'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import VisibleFieldControl, { usePersistedVisibleFields, type VisibleFieldOption } from '@/app/components/VisibleFieldControl'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { resourceAdvancedFields, type ResourceSearchCondition } from '@/lib/resource-search'
import { BusinessDocumentDetailDialog, BusinessDocumentPrintLink } from '@/modules/business-documents'
import { InventoryLotTraceDialog } from '@/modules/inventory'
import ShipmentCreateDialog from './ShipmentCreateDialog'
import ShipmentStatusActions from './ShipmentStatusActions'
import ShipmentPackageSection from './ShipmentPackageSection'
import { loadShipmentDetail, loadShipments } from '../client/fulfillment-api'
import type { FulfillmentCustomer, Shipment } from '../contracts/fulfillment'
import {
  shipmentStatusColors as statusColors,
  shipmentStatusLabels as statusLabels,
  shipmentStatusOptions as statusOptions,
} from '../model/fulfillment-view'
import { buildShipmentSearchCatalog } from '../model/sales-search-fields'

type ShipmentVisibleField = 'image' | 'voucher' | 'location' | 'quantity' | 'unitPrice' | 'amount' | 'customer' | 'status' | 'shippedAt' | 'attachments'
const shipmentVisibleFieldOptions: readonly VisibleFieldOption<ShipmentVisibleField>[] = [
  { key: 'image', label: '物料图片' }, { key: 'voucher', label: '凭据号' }, { key: 'location', label: '发货库位' },
  { key: 'quantity', label: '数量' }, { key: 'unitPrice', label: '单价' }, { key: 'amount', label: '总金额' },
  { key: 'customer', label: '客户' }, { key: 'status', label: '状态' }, { key: 'shippedAt', label: '发货日期' },
  { key: 'attachments', label: '附件' },
]
const defaultShipmentVisibleFields: ShipmentVisibleField[] = ['voucher', 'location', 'quantity', 'unitPrice', 'amount', 'customer', 'status', 'shippedAt', 'attachments']

export default function ShipmentPageModule({
  onMessage,
  onToolbarChange,
  canCreate,
  canDispatch,
  canDeliver,
  canCancel,
  canPackage,
  canManagePackageAttachments,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  canCreate: boolean
  canDispatch: boolean
  canDeliver: boolean
  canCancel: boolean
  canPackage: boolean
  canManagePackageAttachments: boolean
}) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [customers, setCustomers] = useState<FulfillmentCustomer[]>([])
  const [keyword, setKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>(() => (
    typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('task') === 'shipment'
      ? [{ id: 'task-status', field: 'status', operator: 'equals', value: 'PENDING' }]
      : []
  ))
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [detailItem, setDetailItem] = useState<Shipment | null>(null)
  const [traceLotId, setTraceLotId] = useState<string | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.shipment.viewMode', 'list')
  const [visibleFields, setVisibleFields] = usePersistedVisibleFields('mes-lite.shipments.visibleFields', defaultShipmentVisibleFields, shipmentVisibleFieldOptions)
  const showField = (field: ShipmentVisibleField) => visibleFields.includes(field)
  const deepLinkHandledRef = useRef(false)
  const searchCatalog = useMemo(() => buildShipmentSearchCatalog(customers), [customers])
  const advancedSearchFields = useMemo(() => resourceAdvancedFields(searchCatalog), [searchCatalog])

  const shipmentSort = useClientTableSort(shipments, {
    shipmentNo: (item) => item.shipmentNo,
    voucherNo: (item) => item.voucherNo,
    material: (item) => item.items.map((row) => `${row.material.code} ${row.material.name}`).join(' '),
    location: (item) => item.items.map((row) => `${row.location.code} ${row.location.name}`).join(' '),
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
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (searchConditions.length > 0) params.set('advanced', JSON.stringify(searchConditions))
      const data = await loadShipments(params)
      setShipments(data.shipments)
      setCustomers(data.customers)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取发货单列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, searchConditions])

  useEffect(() => {
    void fetchShipments()
  }, [fetchShipments])
  useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined') return
    const shipmentId = new URL(window.location.href).searchParams.get('document')
    if (!shipmentId) return
    deepLinkHandledRef.current = true
    loadShipmentDetail(shipmentId)
      .then(setDetailItem)
      .catch((error) => onMessage(error instanceof Error ? error.message : '获取扫码单据失败'))
  }, [onMessage])
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
            conditions={searchConditions}
            onConditionsChange={setSearchConditions}
          />
        )}
        advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
        viewControl={<div className="flex items-center gap-2"><ViewModeToggle value={viewMode} onChange={setViewMode} /><VisibleFieldControl options={shipmentVisibleFieldOptions} value={visibleFields} onChange={setVisibleFields} /></div>}
        actions={canCreate ? <AppButton variant="create" onClick={() => setShowModal(true)}>新建发货单</AppButton> : undefined}
      />
    )
    return () => onToolbarChange(null)
  }, [advancedSearchFields, canCreate, onToolbarChange, keyword, searchConditions, viewMode, setViewMode, visibleFields, setVisibleFields])

  const refreshDetail = useCallback(async () => {
    if (!detailItem) return
    try {
      setDetailItem(await loadShipmentDetail(detailItem.id))
      await fetchShipments()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '刷新发货单详情失败')
    }
  }, [detailItem, fetchShipments, onMessage])

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
              conditions={searchConditions}
              onConditionsChange={setSearchConditions}
            />
          )}
          advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
          viewControl={<div className="flex items-center gap-2"><ViewModeToggle value={viewMode} onChange={setViewMode} /><VisibleFieldControl options={shipmentVisibleFieldOptions} value={visibleFields} onChange={setVisibleFields} /></div>}
          actions={canCreate ? <AppButton variant="create" onClick={() => setShowModal(true)}>新建发货单</AppButton> : undefined}
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
                  <div className="flex min-w-0 items-start gap-3">
                    {showField('image') && item.items[0]?.material.primaryImage && <img src={item.items[0].material.primaryImage.thumbnailUrl || item.items[0].material.primaryImage.url} alt={item.items[0].material.primaryImage.note || item.items[0].material.name} className="h-14 w-14 shrink-0 rounded-lg border border-gray-200 bg-gray-50 object-cover" />}
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-blue-700">{item.shipmentNo}</div>
                      <div className="mt-1 text-xs text-gray-500">发货物料 · {item.items.length} 项</div>
                      {showField('voucher') && <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>}
                      {showField('shippedAt') && <div className="mt-1 text-xs text-gray-500">{item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '未发货'}</div>}
                    </div>
                  </div>
                  {showField('status') && <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                    {statusLabels[item.status] || item.status}
                  </span>}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 sm:mt-4">
                  <div>
                    <div className="text-xs text-gray-500">物料</div>
                    <div className="mt-1 font-medium text-gray-900">{item.items[0]?.material.name}{item.items.length > 1 ? ` 等 ${item.items.length} 项` : ''}</div>
                    <div className="text-xs text-gray-500">{item.items.map((row) => row.material.code).join('、')}</div>
                    {showField('location') && <div className="mt-1 text-xs text-blue-700">库位：{Array.from(new Set(item.items.map((row) => row.location.code))).join('、')}</div>}
                  </div>
                  {showField('customer') && <div>
                    <div className="text-xs text-gray-500">客户</div>
                    <div className="mt-1 font-medium text-gray-900">{item.customer}</div>
                    <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
                    {item.customerPhone && <div className="text-xs text-gray-500">{item.customerPhone}</div>}
                  </div>}
                </div>
                {(showField('quantity') || showField('unitPrice') || showField('amount')) && <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
                  {showField('quantity') && <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">数量</div>
                    <div className="mt-1 font-semibold">{item.qty}</div>
                  </div>}
                  {showField('unitPrice') && <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">单价</div>
                    <div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(2)}</div>
                  </div>}
                  {showField('amount') && <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">金额</div>
                    <div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                  </div>}
                </div>}
                {(item.address || item.trackingNo || item.note) && (
                  <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                    {item.address && <div>地址：{item.address}</div>}
                    {item.trackingNo && <div className="mt-1">物流：{item.trackingNo}</div>}
                    {item.note && <div className="mt-1">备注：{item.note}</div>}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  {showField('attachments') ? <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} /> : <span />}
                  <div className="flex flex-wrap gap-2">
                    <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                    <BusinessDocumentPrintLink kind="shipment" id={item.id} />
                    <ShipmentStatusActions shipment={item} canDispatch={canDispatch} canDeliver={canDeliver} canCancel={canCancel} onChanged={fetchShipments} onMessage={onMessage} />
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
                  {showField('image') && <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">明细项</th>
                  {showField('voucher') && <SortableTableHeader column="voucherNo" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>凭据号</SortableTableHeader>}
                  <SortableTableHeader column="material" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>物料</SortableTableHeader>
                  {showField('location') && <SortableTableHeader column="location" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>发货库位</SortableTableHeader>}
                  {showField('quantity') && <SortableTableHeader column="qty" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>数量</SortableTableHeader>}
                  {showField('unitPrice') && <SortableTableHeader column="unitPrice" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>单价</SortableTableHeader>}
                  {showField('amount') && <SortableTableHeader column="totalAmount" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>总金额</SortableTableHeader>}
                  {showField('customer') && <SortableTableHeader column="customer" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>客户</SortableTableHeader>}
                  {showField('status') && <SortableTableHeader column="status" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>状态</SortableTableHeader>}
                  {showField('shippedAt') && <SortableTableHeader column="shippedAt" activeColumn={shipmentSort.sortColumn} direction={shipmentSort.sortDirection} onSort={shipmentSort.toggleSort}>发货日期</SortableTableHeader>}
                  {showField('attachments') && <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipmentSort.sortedRows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.shipmentNo}</td>
                    {showField('image') && <td className="px-4 py-3">{item.items[0]?.material.primaryImage ? <img src={item.items[0].material.primaryImage.thumbnailUrl || item.items[0].material.primaryImage.url} alt={item.items[0].material.primaryImage.note || item.items[0].material.name} className="h-12 w-12 rounded border border-gray-200 bg-gray-50 object-cover" /> : <span className="text-xs text-gray-400">无图片</span>}</td>}
                    <td className="px-4 py-3 text-sm text-gray-700">{item.items.length} 项物料</td>
                    {showField('voucher') && <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>}
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.items[0]?.material.name}{item.items.length > 1 ? ` 等 ${item.items.length} 项` : ''}</div>
                      <div className="text-xs text-gray-500">{item.items.map((row) => row.material.code).join('、')}</div>
                    </td>
                    {showField('location') && <td className="px-4 py-3 text-sm">{Array.from(new Set(item.items.map((row) => row.location.code))).join('、')}</td>}
                    {showField('quantity') && <td className="px-4 py-3">{item.qty}</td>}
                    {showField('unitPrice') && <td className="px-4 py-3">¥{item.unitPrice.toFixed(2)}</td>}
                    {showField('amount') && <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>}
	                    {showField('customer') && <td className="px-4 py-3">
	                      <div className="font-medium">{item.customer}</div>
	                      <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
	                      {item.customerPhone && (
	                        <div className="text-xs text-gray-500">{item.customerPhone}</div>
	                      )}
                    </td>}
                    {showField('status') && <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>}
                    {showField('shippedAt') && <td className="px-4 py-3 text-sm text-gray-500">
                      {item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '-'}
                    </td>}
                    {showField('attachments') && <td className="px-4 py-3">
                      <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                    </td>}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                        <BusinessDocumentPrintLink kind="shipment" id={item.id} />
                        <ShipmentStatusActions shipment={item} canDispatch={canDispatch} canDeliver={canDeliver} canCancel={canCancel} onChanged={fetchShipments} onMessage={onMessage} />
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
          description={`${detailItem.items.length} 项明细 · ${statusLabels[detailItem.status] || detailItem.status}`}
          ownerType="SHIPMENT"
          ownerId={detailItem.id}
          onClose={() => setDetailItem(null)}
          onMessage={onMessage}
          headerActions={<BusinessDocumentPrintLink kind="shipment" id={detailItem.id} />}
        >
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-gray-500">明细数量</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.items.length} 项</dd></div>
            <div><dt className="text-gray-500">客户</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.customer}</dd><dd className="text-xs text-gray-500">{detailItem.customerPhone || '-'}</dd></div>
            <div><dt className="text-gray-500">发货库位</dt><dd className="mt-1 font-medium text-gray-900">{Array.from(new Set(detailItem.items.map((row) => row.location.code))).join('、')}</dd></div>
            <div><dt className="text-gray-500">物流单号</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.trackingNo || '-'}</dd></div>
            <div><dt className="text-gray-500">数量</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.qty}</dd></div>
            <div><dt className="text-gray-500">金额</dt><dd className="mt-1 font-medium text-gray-900">¥{detailItem.totalAmount.toFixed(2)}</dd></div>
            <div><dt className="text-gray-500">发货时间</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.shippedAt ? new Date(detailItem.shippedAt).toLocaleString('zh-CN') : '-'}</dd></div>
            <div><dt className="text-gray-500">收货地址</dt><dd className="mt-1 font-medium text-gray-900">{detailItem.address || '-'}</dd></div>
          </dl>
          <section className="mt-5 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">发货明细</h3>
            <div className="mt-2 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">序号</th><th className="px-3 py-2">物料</th><th className="px-3 py-2">库位</th><th className="px-3 py-2">数量</th><th className="px-3 py-2">金额</th></tr></thead><tbody className="divide-y divide-gray-100">{detailItem.items.map((row, index) => <tr key={row.id}><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2"><div className="font-medium">{row.material.code} · {row.material.name}</div><div className="text-xs text-gray-500">{row.material.spec || '-'}</div></td><td className="px-3 py-2">{row.location.code}</td><td className="px-3 py-2">{row.qty} {row.unitSnapshot}</td><td className="px-3 py-2">¥{row.totalAmount.toFixed(2)}</td></tr>)}</tbody></table></div>
          </section>
          <ShipmentPackageSection
            shipment={detailItem}
            canManage={canPackage}
            canManageAttachments={canManagePackageAttachments}
            onRefresh={refreshDetail}
            onMessage={onMessage}
          />
          <section className="mt-5 border-t border-gray-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">客户发货批次</h3>
              <span className="text-xs text-gray-500">追溯状态：{detailItem.lotTraceStatus === 'TRACKED' ? '真实内部批次' : detailItem.lotTraceStatus === 'LEGACY' ? '历史兼容批次' : '待发货'}</span>
            </div>
            {detailItem.lotAllocations.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">待确认发货后生成内部批次分配。</div>
            ) : (
              <div className="mt-2 space-y-2">
                {detailItem.lotAllocations.map((allocation) => (
                  <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                    <div>
                      <div className="font-mono font-medium text-gray-900">{allocation.lot.lotNo}</div>
                      <div className="mt-0.5 text-gray-500">发出 {allocation.stockQty} · 已退 {allocation.returnedStockQty} · {allocation.location.code}</div>
                      {allocation.lot.sourceType === 'LEGACY_SHIPMENT' && <div className="mt-0.5 text-amber-700">历史发货未保存真实批次，本记录仅显式标识兼容来源。</div>}
                    </div>
                    <AppButton size="sm" variant="secondary" onClick={() => setTraceLotId(allocation.lot.id)}>查看谱系</AppButton>
                  </div>
                ))}
              </div>
            )}
          </section>
        </BusinessDocumentDetailDialog>
      )}

      {traceLotId && <InventoryLotTraceDialog lotId={traceLotId} onClose={() => setTraceLotId(null)} onMessage={onMessage} />}

      {canCreate && showModal && (
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
