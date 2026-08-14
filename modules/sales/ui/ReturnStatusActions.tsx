'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { transitionReturn } from '../client/fulfillment-api'
import type { ReturnOrder } from '../contracts/fulfillment'

export default function ReturnStatusActions({
  returnOrder,
  canReceive,
  canReject,
  onChanged,
  onMessage,
}: {
  returnOrder: Pick<ReturnOrder, 'id' | 'returnNo' | 'status'>
  canReceive: boolean
  canReject: boolean
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const run = async (action: 'process' | 'reject', input?: { reason: string }) => {
    setBusy(true)
    try {
      const data = await transitionReturn(returnOrder.id, action, input)
      onMessage(data.message || '操作成功')
      setRejectOpen(false)
      setRejectReason('')
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {canReceive && returnOrder.status === 'PENDING' && (
        <AppButton size="sm" variant="create" disabled={busy} onClick={() => void run('process')}>确认退货收货</AppButton>
      )}
      {canReject && returnOrder.status === 'PENDING' && (
        <AppButton size="sm" variant="danger" disabled={busy} onClick={() => setRejectOpen(true)}>拒绝退货</AppButton>
      )}
      {rejectOpen && (
        <ModalDialog
          title="拒绝退货"
          description={`退货单 ${returnOrder.returnNo} 将结束为已拒绝，不产生退货库存。`}
          onClose={() => setRejectOpen(false)}
          closeDisabled={busy}
          footer={<ModalActions onCancel={() => setRejectOpen(false)} onConfirm={() => void run('reject', { reason: rejectReason.trim() })} confirmLabel="确认拒绝" confirmVariant="danger" disabled={rejectReason.trim().length < 2} busy={busy} />}
        >
          <label className="block text-sm text-gray-700">
            拒绝原因
            <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} maxLength={200} placeholder="至少填写 2 个字，原因将写入操作记录" className={`mt-1 ${appTextareaClassName}`} />
          </label>
        </ModalDialog>
      )}
    </>
  )
}
