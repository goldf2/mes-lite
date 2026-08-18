'use client'

import { useMemo, useState } from 'react'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { createShipmentPackage } from '../client/fulfillment-api'
import type { Shipment } from '../contracts/fulfillment'
import type { ShipmentPackageForm } from '../contracts/shipment-package'

const emptyForm = (remainingQty: number): ShipmentPackageForm => ({
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
  const packedQty = useMemo(() => shipment.packages.reduce(
    (sum, packageDocument) => sum + packageDocument.items.reduce((itemSum, item) => itemSum + Number(item.quantity), 0),
    0,
  ), [shipment.packages])
  const remainingQty = Math.max(0, Number((shipment.qty - packedQty).toFixed(6)))
  const [form, setForm] = useState(() => emptyForm(remainingQty))
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
      description={`发货单 ${shipment.shipmentNo} · 未装 ${remainingQty} ${shipment.product.unit}`}
      onClose={onClose}
      closeDisabled={saving}
      size="lg"
      footer={<ModalActions onCancel={onClose} onConfirm={() => void submit()} confirmLabel="创建货箱" busy={saving} disabled={remainingQty <= 0} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="装箱数量" required hint={`最多 ${remainingQty} ${shipment.product.unit}`}>
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
