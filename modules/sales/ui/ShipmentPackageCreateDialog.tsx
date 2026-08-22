'use client'

import { useMemo, useState } from 'react'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { createShipmentPackage } from '../client/fulfillment-api'
import type { Shipment } from '../contracts/fulfillment'
import type { ShipmentPackageForm } from '../contracts/shipment-package'

const emptyForm = (shipmentItemId: string, remainingQty: number): ShipmentPackageForm => ({
  shipmentItemId,
  quantity: remainingQty,
  packedBy: '',
  weightUnit: 'kg',
  sealNo: '',
  note: '',
})

function optionalNumber(value: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export default function ShipmentPackageCreateDialog({
  shipment,
  onClose,
  onCreated,
  onMessage,
}: {
  shipment: Shipment
  onClose: () => void
  onCreated: () => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const remainingByItem = useMemo(() => new Map(shipment.items.map((item) => {
    const packedQty = shipment.packages.reduce((sum, packageDocument) => sum + packageDocument.items.filter((row) => row.shipmentItemId === item.id).reduce((itemSum, row) => itemSum + Number(row.quantity), 0), 0)
    return [item.id, Math.max(0, Number((item.qty - packedQty).toFixed(6)))]
  })), [shipment.items, shipment.packages])
  const firstItem = shipment.items.find((item) => (remainingByItem.get(item.id) || 0) > 0) || shipment.items[0]
  const [form, setForm] = useState(() => emptyForm(firstItem?.id || '', firstItem ? remainingByItem.get(firstItem.id) || 0 : 0))
  const selectedItem = shipment.items.find((item) => item.id === form.shipmentItemId)
  const remainingQty = selectedItem ? remainingByItem.get(selectedItem.id) || 0 : 0
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (form.quantity <= 0 || form.quantity > remainingQty + 0.000001) {
      onMessage(`装箱数量必须在 0 与 ${remainingQty} 之间`)
      return
    }
    setSaving(true)
    try {
      const created = await createShipmentPackage(shipment.id, form)
      onMessage(`货箱已创建：${created.packageNo}`)
      await onCreated()
      onClose()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '创建货箱单据失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog
      title="新增货箱"
      description={`发货单 ${shipment.shipmentNo} · 按发货明细记录货箱数量`}
      onClose={onClose}
      closeDisabled={saving}
      size="lg"
      footer={<ModalActions onCancel={onClose} onConfirm={() => void submit()} confirmLabel="创建货箱" busy={saving} disabled={remainingQty <= 0} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="发货明细" required className="sm:col-span-2">
          <select value={form.shipmentItemId} onChange={(event) => { const shipmentItemId = event.target.value; setForm((current) => ({ ...current, shipmentItemId, quantity: remainingByItem.get(shipmentItemId) || 0 })) }} className={appInputClassName}>
            {shipment.items.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.material.code} · {item.material.name} · 未装 {remainingByItem.get(item.id) || 0} {item.unitSnapshot}</option>)}
          </select>
        </FormField>
        <FormField label="装箱数量" required hint={`最多 ${remainingQty} ${selectedItem?.unitSnapshot || ''}`}>
          <input type="number" min="0.000001" max={remainingQty} step="any" value={form.quantity || ''} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="打包人员" hint="留空时记录当前操作人">
          <input value={form.packedBy} onChange={(event) => setForm((current) => ({ ...current, packedBy: event.target.value }))} className={appInputClassName} />
        </FormField>
        <FormField label="封箱号">
          <input value={form.sealNo} onChange={(event) => setForm((current) => ({ ...current, sealNo: event.target.value }))} className={appInputClassName} />
        </FormField>
        <FormField label="毛重">
          <input type="number" min="0" step="any" onChange={(event) => setForm((current) => ({ ...current, grossWeight: optionalNumber(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="净重">
          <input type="number" min="0" step="any" onChange={(event) => setForm((current) => ({ ...current, netWeight: optionalNumber(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="重量单位">
          <input value={form.weightUnit} onChange={(event) => setForm((current) => ({ ...current, weightUnit: event.target.value }))} className={appInputClassName} />
        </FormField>
        <FormField label="长（mm）">
          <input type="number" min="0" step="any" onChange={(event) => setForm((current) => ({ ...current, lengthMm: optionalNumber(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="宽（mm）">
          <input type="number" min="0" step="any" onChange={(event) => setForm((current) => ({ ...current, widthMm: optionalNumber(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="高（mm）">
          <input type="number" min="0" step="any" onChange={(event) => setForm((current) => ({ ...current, heightMm: optionalNumber(event.target.value) }))} className={appInputClassName} />
        </FormField>
        <FormField label="备注" className="sm:col-span-2 lg:col-span-3">
          <textarea rows={3} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className={appTextareaClassName} placeholder="包装方式、外观、异常或其他现场说明" />
        </FormField>
      </div>
      <div className="mt-5 rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
        货箱创建后再上传货箱实物和打包现场照片；一旦创建了货箱，发货前所有有效货箱数量必须与发货单一致。
      </div>
    </ModalDialog>
  )
}
