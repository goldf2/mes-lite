'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { loadEquipmentEvents, saveEquipmentEvent } from '../client/equipment-api'
import type { EquipmentEventItem, EquipmentItem } from '../contracts/equipment'
import { availableEquipmentEventActions, equipmentEventActionLabels } from '../domain/equipment-event-rules'
import { equipmentStatusLabels } from '../model/equipment-view'

function durationLabel(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return '-'
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

export default function EquipmentEventDialog({ equipment, canCommand, onClose, onChanged, onMessage }: {
  equipment: EquipmentItem
  canCommand: boolean
  onClose: () => void
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [events, setEvents] = useState<EquipmentEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const actions = useMemo(() => availableEquipmentEventActions(equipment.status), [equipment.status])
  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await loadEquipmentEvents(equipment.id)) }
    catch (error) { onMessage(error instanceof Error ? error.message : '获取设备事件失败') }
    finally { setLoading(false) }
  }, [equipment.id, onMessage])
  useEffect(() => { void load() }, [load])

  const submit = async () => {
    if (!action || !reason.trim()) return onMessage('请选择设备动作并填写原因')
    setSaving(true)
    try {
      await saveEquipmentEvent(equipment.id, { action, reason, note })
      onMessage(`${equipment.code} 已${equipmentEventActionLabels[action as keyof typeof equipmentEventActionLabels]}`)
      await onChanged()
      onClose()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存设备事件失败')
    } finally { setSaving(false) }
  }

  return (
    <ModalDialog title={`${equipment.code} · ${equipment.name}`} description="设备运行状态时间线；每次变化保留原因、人员和时间。" onClose={onClose} closeDisabled={saving} size="xl" footer={action ? <ModalActions onCancel={() => setAction(null)} onConfirm={submit} confirmLabel="确认记录事件" busy={saving} /> : <AppButton variant="primary" onClick={onClose}>关闭</AppButton>}>
      <div className="space-y-5">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div><div className="text-xs text-blue-600">当前状态</div><div className="mt-1 text-xl font-semibold text-blue-950">{equipmentStatusLabels[equipment.status] || equipment.status}</div></div>
          {canCommand && <div className="flex flex-wrap gap-2">{actions.map((item) => <AppButton key={item} size="sm" variant={item === 'FAULT' ? 'danger' : item === 'STOP' ? 'warning' : 'primary'} onClick={() => { setAction(item); setReason(''); setNote('') }}>{equipmentEventActionLabels[item]}</AppButton>)}</div>}
        </section>
        {action && <section className="rounded-xl border border-gray-200 bg-gray-50 p-4"><h3 className="font-semibold text-gray-900">{equipmentEventActionLabels[action as keyof typeof equipmentEventActionLabels]}</h3><div className="mt-4 grid gap-4"><label className="text-sm font-medium text-gray-700">原因 *<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className={`mt-2 ${appTextareaClassName}`} placeholder="填写现场可核对的停机、故障或恢复原因" /></label><label className="text-sm font-medium text-gray-700">补充说明<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className={`mt-2 ${appTextareaClassName}`} /></label></div></section>}
        <section><h3 className="font-semibold text-gray-900">事件时间线</h3>{loading ? <div className="py-8 text-center text-sm text-gray-500">正在加载事件…</div> : events.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">尚无设备运行事件。</div> : <ol className="mt-3 space-y-3">{events.map((event) => <li key={event.id} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{equipmentEventActionLabels[event.eventType as keyof typeof equipmentEventActionLabels] || event.eventType}</div><div className="mt-1 text-sm text-gray-600">{equipmentStatusLabels[event.sourceStatus] || event.sourceStatus} → {equipmentStatusLabels[event.targetStatus] || event.targetStatus}</div></div><time className="text-xs text-gray-500">{new Date(event.occurredAt).toLocaleString('zh-CN')}</time></div><div className={`mt-3 grid gap-2 text-sm text-gray-600 ${event.durationSeconds === null || event.durationSeconds === undefined ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}><div><span className="text-gray-400">原因：</span>{event.reason}</div><div><span className="text-gray-400">操作人：</span>{event.operatorName}</div>{event.durationSeconds !== null && event.durationSeconds !== undefined && <div><span className="text-gray-400">持续：</span>{durationLabel(event.durationSeconds)}</div>}</div>{event.note && <div className="mt-2 text-sm text-gray-500">{event.note}</div>}</li>)}</ol>}</section>
      </div>
    </ModalDialog>
  )
}
