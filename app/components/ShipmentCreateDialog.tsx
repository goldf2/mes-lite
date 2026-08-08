'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'
import DraftDocumentAttachmentPanel, {
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from './DraftDocumentAttachmentPanel'
import { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from './BusinessDocumentPrintLink'
import ModalDialog, { ModalActions } from './ModalDialog'
import SearchableSelect from './SearchableSelect'

interface Customer {
  id: string
  code: string
  name: string
}

interface ShippableSalesItem {
  id: string
  salesOrderId: string
  remainingQty: number
  unit: string
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
    stock?: {
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

interface ShipmentCreated {
  id: string
  shipmentNo: string
}

interface ShipmentForm {
  salesOrderItemId: string
  locationId: string
  qty: number
  trackingNo: string
  shippedBy: string
  note: string
}

const emptyForm: ShipmentForm = {
  salesOrderItemId: '',
  locationId: '',
  qty: 0,
  trackingNo: '',
  shippedBy: '',
  note: '',
}

export default function ShipmentCreateDialog({
  initialSalesOrderId,
  onClose,
  onCreated,
  onMessage,
}: {
  initialSalesOrderId?: string
  onClose: () => void
  onCreated?: (shipment: ShipmentCreated) => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const [shippableItems, setShippableItems] = useState<ShippableSalesItem[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [form, setForm] = useState<ShipmentForm>(emptyForm)
  const [preparing, setPreparing] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draftAttachmentOwnerId] = useState(createDraftDocumentAttachmentId)
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)

  const selectedSalesItem = useMemo(
    () => shippableItems.find((item) => item.id === form.salesOrderItemId),
    [form.salesOrderItemId, shippableItems],
  )
  const selectedLocationBalance = selectedSalesItem?.material.stock?.locationBalances.find(
    (item) => item.locationId === form.locationId,
  )

  const applySalesItemSelection = useCallback((salesOrderItemId: string, items: ShippableSalesItem[], locationOptions: InventoryLocation[]) => {
    const item = items.find((option) => option.id === salesOrderItemId)
    const bestBalance = item?.material.stock?.locationBalances
      .filter((balance) => locationOptions.some((location) => location.id === balance.locationId))
      .sort((left, right) => Number(right.availableQty) - Number(left.availableQty))[0]
    const locationId = bestBalance?.locationId
      || locationOptions.find((location) => location.isDefault)?.id
      || locationOptions[0]?.id
      || ''
    setForm((current) => ({
      ...current,
      salesOrderItemId,
      locationId,
      qty: Number(item?.remainingQty || 0),
    }))
  }, [])

  const selectSalesItem = useCallback((salesOrderItemId: string) => {
    applySalesItemSelection(salesOrderItemId, shippableItems, locations)
  }, [applySalesItemSelection, locations, shippableItems])

  useEffect(() => {
    let active = true
    const prepare = async () => {
      try {
        const [itemResponse, locationResponse] = await Promise.all([
          fetch('/api/sales-orders/shippable'),
          fetch('/api/inventory-locations'),
        ])
        const itemData = itemResponse.ok ? await itemResponse.json() : { data: [] }
        const locationData = locationResponse.ok ? await locationResponse.json() : { data: [] }
        if (!active) return
        const nextItems: ShippableSalesItem[] = itemData.data || []
        const nextLocations: InventoryLocation[] = locationData.data || []
        setShippableItems(nextItems)
        setLocations(nextLocations)
        const preferredItem = nextItems.find((item) => item.salesOrderId === initialSalesOrderId)
        if (preferredItem) applySalesItemSelection(preferredItem.id, nextItems, nextLocations)
        else setForm((current) => ({
          ...current,
          locationId: nextLocations.find((location) => location.isDefault)?.id || nextLocations[0]?.id || '',
        }))
      } catch {
        if (active) onMessage('获取可发货订单或库位失败')
      } finally {
        if (active) setPreparing(false)
      }
    }
    void prepare()
    return () => { active = false }
  }, [applySalesItemSelection, initialSalesOrderId, onMessage])

  const closeDialog = async () => {
    if (saving || draftAttachmentBusy) return
    await discardDraftDocumentAttachments('SHIPMENT', draftAttachmentOwnerId)
    onClose()
  }

  const applyRecognizedShipment = (fields: Record<string, unknown>) => {
    const salesOrderNo = recognizedText(fields, 'salesOrderNo')
    const material = recognizedText(fields, 'material')
    const matchedItem = shippableItems.find((item) => (
      matchesRecognizedValue(salesOrderNo, [item.salesOrder.orderNo, item.salesOrder.voucherNo])
      || matchesRecognizedValue(material, [item.material.code, item.material.name, item.material.spec])
    ))
    if (matchedItem) selectSalesItem(matchedItem.id)
    const qty = recognizedNumber(fields, 'qty')
    setForm((current) => ({
      ...current,
      salesOrderItemId: matchedItem?.id || current.salesOrderItemId,
      qty: qty > 0 ? qty : (matchedItem ? Number(matchedItem.remainingQty) : current.qty),
      trackingNo: recognizedText(fields, 'trackingNo') || current.trackingNo,
      shippedBy: recognizedText(fields, 'shippedBy') || current.shippedBy,
      note: recognizedText(fields, 'note') || current.note,
    }))
  }

  const handleSubmit = async () => {
    if (draftAttachmentBusy) return onMessage('请等待附件上传或 AI 识别完成')
    if (!form.salesOrderItemId || !form.locationId || form.qty <= 0) {
      return onMessage('请选择销售订单明细和发货库位，并填写数量')
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setSaving(true)
    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          trackingNo: form.trackingNo || undefined,
          shippedBy: form.shippedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        printPreview.close()
        return onMessage(data.error || '创建发货单失败')
      }
      try {
        await finalizeDraftDocumentAttachments({ ownerType: 'SHIPMENT', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: data.data.id })
      } catch (error) {
        onMessage(error instanceof Error ? `发货单已创建，但${error.message}` : '发货单已创建，但附件绑定失败')
      }
      onMessage(`发货单创建成功：${data.data.shipmentNo}`)
      const pdfGenerated = await generateBusinessDocumentPdfArchives('shipment', [data.data.id])
      if (pdfGenerated) printPreview.open('shipment', data.data.id)
      else {
        printPreview.close()
        onMessage('发货单已创建，但 PDF 生成失败，可在发货列表中重新打印')
      }
      await onCreated?.(data.data)
      onClose()
    } catch {
      printPreview.close()
      onMessage('创建发货单失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog
      title="新建发货单"
      description={initialSalesOrderId ? '已带入当前销售订单，可选择未发完的物料明细。' : '发货单必须来自已确认销售订单，可按订单未发数量分批出库。'}
      onClose={() => void closeDialog()}
      closeDisabled={saving || draftAttachmentBusy}
      size="lg"
      footer={(
        <ModalActions
          onCancel={() => void closeDialog()}
          onConfirm={handleSubmit}
          confirmLabel="创建并输出 PDF"
          busy={saving || draftAttachmentBusy}
          disabled={preparing}
        />
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">销售订单明细</label>
          <SearchableSelect
            value={form.salesOrderItemId}
            options={shippableItems.map((item) => ({
              value: item.id,
              label: `${item.salesOrder.orderNo} · ${item.salesOrder.customer.name} · ${item.material.name}`,
              keywords: `${item.salesOrder.voucherNo || ''} ${item.material.code} ${item.material.spec || ''}`,
            }))}
            onChange={selectSalesItem}
            placeholder={preparing ? '正在读取可发货明细…' : '输入销售订单号、客户、物料或规格筛选'}
            emptyText="没有可发货的销售订单明细"
          />
          {!preparing && shippableItems.length === 0 && (
            <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">没有可发货明细，请先创建并确认销售订单。</div>
          )}
        </div>

        {selectedSalesItem && (
          <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm sm:grid-cols-3">
            <div><span className="text-blue-600">客户</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.salesOrder.customer.name}</div></div>
            <div><span className="text-blue-600">物料</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.material.code} · {selectedSalesItem.material.name}</div></div>
            <div><span className="text-blue-600">未发数量</span><div className="mt-1 font-medium text-blue-950">{selectedSalesItem.remainingQty} {selectedSalesItem.unit}</div></div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">发货库位</label>
            <SearchableSelect
              value={form.locationId}
              onChange={(locationId) => setForm((current) => ({ ...current, locationId }))}
              options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
              placeholder="输入库位编码或名称筛选"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">数量{selectedSalesItem ? ` (${selectedSalesItem.unit})` : ''}</label>
            <input
              type="number"
              step="any"
              value={form.qty || ''}
              onChange={(event) => setForm((current) => ({ ...current, qty: Number(event.target.value) }))}
              min={0}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {selectedSalesItem && (
          <div className={`rounded px-3 py-2 text-xs ${form.qty > Number(selectedLocationBalance?.availableQty || 0) ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            当前可用：<strong>{selectedLocationBalance?.availableQty || 0} {selectedSalesItem.unit}</strong>；本次最多可按订单发出 {selectedSalesItem.remainingQty} {selectedSalesItem.unit}。
            {form.qty > Number(selectedLocationBalance?.availableQty || 0) && ' 当前库位库存不足，不能生成发货单。'}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">物流单号</label>
            <input type="text" value={form.trackingNo} onChange={(event) => setForm((current) => ({ ...current, trackingNo: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">发货人</label>
            <input type="text" value={form.shippedBy} onChange={(event) => setForm((current) => ({ ...current, shippedBy: event.target.value }))} className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">备注</label>
          <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={3} className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
        </div>
        <DraftDocumentAttachmentPanel
          ownerType="SHIPMENT"
          draftOwnerId={draftAttachmentOwnerId}
          onRecognized={applyRecognizedShipment}
          onBusyChange={setDraftAttachmentBusy}
          onMessage={onMessage}
        />
      </div>
    </ModalDialog>
  )
}
