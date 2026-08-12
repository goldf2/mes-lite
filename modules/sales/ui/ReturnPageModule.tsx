'use client'

import { ReactNode, useCallback, useMemo, useState, useEffect } from 'react'
import { AttachmentPanel } from '@/modules/attachments'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SearchableSelect from '@/app/components/SearchableSelect'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import AppButton from '@/app/components/AppButton'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { BusinessDocumentPrintLink, generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from '@/modules/business-documents'
import {
  DraftDocumentAttachmentPanel,
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/modules/attachments'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'
import { createReturn, loadReturnOptions, loadReturns, transitionReturn } from '../client/fulfillment-api'
import ReturnDetailDialog from './ReturnDetailDialog'
import type {
  FulfillmentCustomer,
  InventoryLocationOption,
  ReturnMaterialOption,
  ReturnOrder,
  ReturnShipmentOption,
} from '../contracts/fulfillment'
import {
  returnStatusColors as statusColors,
  returnStatusLabels as statusLabels,
  returnStatusOptions as statusOptions,
} from '../model/fulfillment-view'

export default function ReturnPageModule({
  onMessage,
  onToolbarChange,
  canQualityUpdate,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  canQualityUpdate: boolean
}) {
  const [returns, setReturns] = useState<ReturnOrder[]>([])
  const [products, setProducts] = useState<ReturnMaterialOption[]>([])
  const [customers, setCustomers] = useState<FulfillmentCustomer[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [shipments, setShipments] = useState<ReturnShipmentOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [draftAttachmentOwnerId, setDraftAttachmentOwnerId] = useState('')
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)
  const [detailItem, setDetailItem] = useState<ReturnOrder | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.return.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
  ], [customers, selectedCustomerId, selectedStatuses])

  const [form, setForm] = useState({
    voucherNo: '',
    shipmentId: '',
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
  const selectedShipment = shipments.find((item) => item.id === form.shipmentId)

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const nextReturns = await loadReturns(params)
      setReturns(nextReturns)
      setDetailItem((current) => current ? nextReturns.find((item) => item.id === current.id) || current : null)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取退货单列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, selectedCustomerId, selectedStatuses])

  const fetchOptions = useCallback(async () => {
    try {
      const data = await loadReturnOptions()
      setCustomers(data.customers)
      setProducts(data.products)
      setLocations(data.locations)
      setShipments(data.shipments)
      setForm((current) => current.locationId ? current : {
        ...current,
        locationId: data.locations.find((location) => location.isDefault)?.id || data.locations[0]?.id || '',
      })
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取退货选项失败')
    }
  }, [onMessage])

  useEffect(() => {
    void fetchReturns()
  }, [fetchReturns])

  useEffect(() => {
    void fetchOptions()
  }, [fetchOptions])

  const resetForm = useCallback(() => {
    setForm({
      voucherNo: '',
      shipmentId: '',
      productId: '',
      locationId: locations.find((location) => location.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      reason: '',
      note: '',
    })
  }, [locations])

  const openCreate = useCallback(() => {
    resetForm()
    setDraftAttachmentOwnerId(createDraftDocumentAttachmentId())
    setShowModal(true)
  }, [resetForm])

  const closeCreate = async () => {
    if (loading || draftAttachmentBusy) return
    await discardDraftDocumentAttachments('RETURN_ORDER', draftAttachmentOwnerId)
    setDraftAttachmentOwnerId('')
    setShowModal(false)
    resetForm()
  }

  const applyRecognizedReturn = async (fields: Record<string, unknown>) => {
    const material = recognizedText(fields, 'material')
    const matchedProduct = products.find((product) => matchesRecognizedValue(material, [product.sku, product.name]))
    const qty = recognizedNumber(fields, 'qty')
    const shipmentNo = recognizedText(fields, 'shipmentNo')
    const matchedShipment = shipments.find((shipment) => matchesRecognizedValue(shipmentNo, [shipment.shipmentNo]))
    setForm((current) => ({
      ...current,
      voucherNo: recognizedText(fields, 'voucherNo') || recognizedText(fields, 'shipmentNo') || current.voucherNo,
      shipmentId: matchedShipment?.id || current.shipmentId,
      productId: matchedShipment?.productId || matchedProduct?.id || current.productId,
      qty: qty > 0 ? qty : current.qty,
      reason: recognizedText(fields, 'reason') || current.reason,
      note: recognizedText(fields, 'note') || current.note,
    }))
  }

  const handleSubmit = async () => {
    if (draftAttachmentBusy) {
      onMessage('请等待附件上传或 AI 识别完成')
      return
    }
    if (!form.shipmentId || !form.productId || !form.locationId || form.qty <= 0 || !form.reason) {
      onMessage('请选择原发货单和退回库位，并填写数量和退货原因')
      return
    }
    if (selectedShipment && form.qty > selectedShipment.returnableQty + 0.000001) {
      onMessage(`退货数量不能超过剩余可退数量 ${selectedShipment.returnableQty}`)
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const returnOrder = await createReturn(form)
      try {
        await finalizeDraftDocumentAttachments({ ownerType: 'RETURN_ORDER', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: returnOrder.id })
      } catch (error) {
        onMessage(error instanceof Error ? `退货单已创建，但${error.message}` : '退货单已创建，但附件绑定失败')
      }
      onMessage(`退货单创建成功：${returnOrder.returnNo}`)
      const pdfGenerated = await generateBusinessDocumentPdfArchives('return', [returnOrder.id])
      if (pdfGenerated) printPreview.open('return', returnOrder.id)
      else {
        printPreview.close()
        onMessage('退货单已创建，但 PDF 生成失败，可在退货列表中重新打印')
      }
      setShowModal(false)
      setDraftAttachmentOwnerId('')
      resetForm()
      await fetchReturns()
    } catch (error) {
      printPreview.close()
      onMessage(error instanceof Error ? error.message : '创建退货单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (id: string, action: 'process' | 'reject') => {
    setLoading(true)
    try {
      const data = await transitionReturn(id, action)
      onMessage(data.message || '操作成功')
      await fetchReturns()
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
              onClick={openCreate}
            >
              新建退货单
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, onToolbarChange, openCreate, viewMode, setViewMode])

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
                onClick={openCreate}
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
                  <AttachmentPanel ownerType="RETURN_ORDER" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
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
                      <AttachmentPanel ownerType="RETURN_ORDER" ownerId={item.id} compact compactMode="summary" onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AppButton size="sm" variant="secondary" onClick={() => setDetailItem(item)}>详情</AppButton>
                        <BusinessDocumentPrintLink kind="return" id={item.id} compact />
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailItem && (
        <ReturnDetailDialog item={detailItem} canQualityUpdate={canQualityUpdate} onClose={() => setDetailItem(null)} onChanged={fetchReturns} onMessage={onMessage} />
      )}

      {showModal && (
        <ModalDialog
          title="新建退货单"
          description="选择原发货单，登记退回数量；收货后先进入待检库存。"
          onClose={() => void closeCreate()}
          closeDisabled={loading || draftAttachmentBusy}
          footer={(
            <ModalActions
              onCancel={() => void closeCreate()}
              onConfirm={handleSubmit}
              confirmLabel="创建并输出 PDF"
              busy={loading || draftAttachmentBusy}
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
              <FormField label="原发货单" required hint="仅显示已发货/已签收且仍有可退数量的单据。">
                <SearchableSelect
                  value={form.shipmentId}
                  onChange={(shipmentId) => {
                    const shipment = shipments.find((item) => item.id === shipmentId)
                    setForm((current) => ({ ...current, shipmentId, productId: shipment?.productId || '', qty: 0 }))
                  }}
                  options={shipments.map((shipment) => ({
                    value: shipment.id,
                    label: `${shipment.shipmentNo} · ${shipment.customerRef?.name || shipment.customer} · ${shipment.product.sku} · 可退 ${shipment.returnableQty} ${shipment.product.unit}`,
                  }))}
                  placeholder="输入发货单号、客户或物料筛选"
                />
              </FormField>
              <FormField label="退货物料">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                  {selectedShipment ? `${selectedShipment.product.sku} · ${selectedShipment.product.name}` : '选择原发货单后自动带出'}
                </div>
              </FormField>
              <FormField label={`数量${selectedProduct ? `（${selectedProduct.unit}）` : ''}`} required hint={selectedShipment ? `剩余可退 ${selectedShipment.returnableQty} ${selectedShipment.product.unit}` : '请先选择原发货单'}>
                <input
                  type="number"
                  step="any"
                  value={form.qty || ''}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  min={0}
                  max={selectedShipment?.returnableQty}
                  className={appInputClassName}
                />
              </FormField>
              <FormField label="退回库位" required hint="确认收货后先进入该库位的待检库存，质检合格后才转为可用。">
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
              <DraftDocumentAttachmentPanel
                ownerType="RETURN_ORDER"
                draftOwnerId={draftAttachmentOwnerId}
                onRecognized={applyRecognizedReturn}
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
