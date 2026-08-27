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
  canReverse,
  onChanged,
  onMessage,
}: {
  shipment: Pick<Shipment, 'id' | 'shipmentNo' | 'status'>
  canDispatch: boolean
  canDeliver: boolean
  canCancel: boolean
  canReverse: boolean
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [reasonAction, setReasonAction] = useState<'cancel' | 'reverse' | null>(null)
  const [reason, setReason] = useState('')

  const run = async (action: 'ship' | 'deliver' | 'cancel' | 'reverse', input?: { reason: string }) => {
    setBusy(true)
    try {
      const data = await transitionShipment(shipment.id, action, input)
      onMessage(data.message || '操作成功')
      setReasonAction(null)
      setReason('')
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
        <AppButton size="sm" variant="danger" disabled={busy} onClick={() => setReasonAction('cancel')}>取消发货</AppButton>
      )}
      {canReverse && shipment.status === 'SHIPPED' && (
        <AppButton size="sm" variant="danger" disabled={busy} onClick={() => setReasonAction('reverse')}>冲销发货</AppButton>
      )}
      {reasonAction && (
        <ModalDialog
          title={reasonAction === 'reverse' ? '冲销已发货单' : '取消待发货单'}
          description={reasonAction === 'reverse'
            ? `发货单 ${shipment.shipmentNo} 的库存、成本和批次发出将以逆向流水恢复；原记录永久保留。`
            : `发货单 ${shipment.shipmentNo} 取消后不能再执行库存发出。`}
          onClose={() => setReasonAction(null)}
          closeDisabled={busy}
          footer={<ModalActions onCancel={() => setReasonAction(null)} onConfirm={() => void run(reasonAction, { reason: reason.trim() })} confirmLabel={reasonAction === 'reverse' ? '确认冲销' : '确认取消'} confirmVariant="danger" disabled={reason.trim().length < 2} busy={busy} />}
        >
          <label className="block text-sm text-gray-700">
            {reasonAction === 'reverse' ? '冲销原因' : '取消原因'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={200} placeholder="至少填写 2 个字，原因将写入单据和操作记录" className={`mt-1 ${appTextareaClassName}`} />
          </label>
        </ModalDialog>
      )}
    </>
  )
}
