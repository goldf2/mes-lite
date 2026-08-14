'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { transitionShipment } from '../client/fulfillment-api'
import type { Shipment } from '../contracts/fulfillment'

export default function ShipmentStatusActions({
  shipment,
  canDispatch,
  canDeliver,
  canCancel,
  onChanged,
  onMessage,
}: {
  shipment: Pick<Shipment, 'id' | 'shipmentNo' | 'status'>
  canDispatch: boolean
  canDeliver: boolean
  canCancel: boolean
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const run = async (action: 'ship' | 'deliver' | 'cancel', input?: { reason: string }) => {
    setBusy(true)
    try {
      const data = await transitionShipment(shipment.id, action, input)
      onMessage(data.message || '操作成功')
      setCancelOpen(false)
      setCancelReason('')
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {canDispatch && shipment.status === 'PENDING' && (
        <AppButton size="sm" variant="create" disabled={busy} onClick={() => void run('ship')}>确认发货</AppButton>
      )}
      {canDeliver && shipment.status === 'SHIPPED' && (
        <AppButton size="sm" variant="create" disabled={busy} onClick={() => void run('deliver')}>确认签收</AppButton>
      )}
      {canCancel && shipment.status === 'PENDING' && (
        <AppButton size="sm" variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>取消发货</AppButton>
      )}
      {cancelOpen && (
        <ModalDialog
          title="取消待发货单"
          description={`发货单 ${shipment.shipmentNo} 取消后不能再执行库存发出。`}
          onClose={() => setCancelOpen(false)}
          closeDisabled={busy}
          footer={<ModalActions onCancel={() => setCancelOpen(false)} onConfirm={() => void run('cancel', { reason: cancelReason.trim() })} confirmLabel="确认取消" confirmVariant="danger" disabled={cancelReason.trim().length < 2} busy={busy} />}
        >
          <label className="block text-sm text-gray-700">
            取消原因
            <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} maxLength={200} placeholder="至少填写 2 个字，原因将写入操作记录" className={`mt-1 ${appTextareaClassName}`} />
          </label>
        </ModalDialog>
      )}
    </>
  )
}
