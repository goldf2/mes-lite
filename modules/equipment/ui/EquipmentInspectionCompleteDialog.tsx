'use client'

import { useState } from 'react'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import type { EquipmentInspectionPlan } from '../contracts/equipment-inspection'
import { completeEquipmentInspection } from '../client/equipment-inspection-api'

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function EquipmentInspectionCompleteDialog({ plan, onClose, onSaved, onMessage }: {
  plan: EquipmentInspectionPlan
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [operationId] = useState(() => crypto.randomUUID())
  const [inspectedAt, setInspectedAt] = useState(localDateTimeValue())
  const [note, setNote] = useState('')
  const [items, setItems] = useState(() => plan.items.map((item) => ({ planItemId: item.id, actualValue: '', result: 'PASS' as 'PASS' | 'FAIL', note: '' })))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const missingNote = items.some((item) => item.result === 'FAIL' && !item.note.trim())
    if (missingNote) return onMessage('异常项目必须填写异常说明')
    setSaving(true)
    try {
      const result = await completeEquipmentInspection(plan.id, { operationId, inspectedAt: new Date(inspectedAt), note: note || null, items: items.map((item) => ({ ...item, actualValue: item.actualValue || null, note: item.note || null })) }) as { record?: { result?: string }; duplicate?: boolean } | undefined
      onMessage(result?.duplicate ? '该次点检已经保存，请勿重复提交' : result?.record?.result === 'ABNORMAL' ? '点检异常已记录，并已联动设备故障事件' : '设备点检已完成')
      await onSaved()
      onClose()
    } catch (error) { onMessage(error instanceof Error ? error.message : '完成设备点检失败') }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog title={`${plan.equipment.code} · 执行点检`} description={`到期 ${new Date(plan.nextDueAt).toLocaleString('zh-CN')}；必须逐项填写，异常项会联动设备故障事件。`} onClose={onClose} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={onClose} onConfirm={save} confirmLabel="确认完成点检" busy={saving} />}>
      <label className="block text-sm font-medium text-gray-700">实际点检时间 *<input type="datetime-local" value={inspectedAt} onChange={(event) => setInspectedAt(event.target.value)} className={`mt-2 max-w-sm ${appInputClassName}`} /></label>
      <div className="mt-5 space-y-3">{plan.items.map((planItem, index) => {
        const item = items[index]
        return <section key={planItem.id} className={`rounded-lg border p-4 ${item.result === 'FAIL' ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{index + 1}. {planItem.name}</div><div className="mt-1 text-sm text-gray-600">标准：{planItem.standard}{planItem.unit ? `（${planItem.unit}）` : ''}</div></div><div className="flex rounded-lg border border-gray-300 bg-white p-1"><button type="button" onClick={() => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, result: 'PASS' } : candidate))} className={`rounded px-3 py-1 text-xs ${item.result === 'PASS' ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}>正常</button><button type="button" onClick={() => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, result: 'FAIL' } : candidate))} className={`rounded px-3 py-1 text-xs ${item.result === 'FAIL' ? 'bg-red-600 text-white' : 'text-gray-600'}`}>异常</button></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-gray-700">实测值<input value={item.actualValue} onChange={(event) => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, actualValue: event.target.value } : candidate))} className={`mt-1 ${appInputClassName}`} /></label><label className="text-sm text-gray-700">{item.result === 'FAIL' ? '异常说明 *' : '项目说明'}<input value={item.note} onChange={(event) => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, note: event.target.value } : candidate))} className={`mt-1 ${appInputClassName}`} /></label></div>
        </section>
      })}</div>
      <label className="mt-4 block text-sm font-medium text-gray-700">整次说明<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className={`mt-2 ${appTextareaClassName}`} /></label>
    </ModalDialog>
  )
}
