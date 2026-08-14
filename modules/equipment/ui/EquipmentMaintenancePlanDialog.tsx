'use client'

import { useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { ManyToOneRelationField, RelationSearch } from '@/app/components/relations'
import { saveEquipmentMaintenancePlan } from '../client/equipment-maintenance-api'
import type { EquipmentMaintenanceEquipmentOption } from '../contracts/equipment-maintenance'

type DraftItem = { id: string; name: string; standard: string }

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
export default function EquipmentMaintenancePlanDialog({ equipmentOptions, onClose, onSaved, onMessage }: {
  equipmentOptions: EquipmentMaintenanceEquipmentOption[]
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [form, setForm] = useState({ code: '', name: '', equipmentId: '', intervalDays: 30, nextDueAt: localDateTimeValue(), note: '' })
  const [items, setItems] = useState<DraftItem[]>([])
  const [draftItem, setDraftItem] = useState({ name: '', standard: '' })
  const [saving, setSaving] = useState(false)
  const selectedEquipment = useMemo(() => equipmentOptions.find((item) => item.id === form.equipmentId), [equipmentOptions, form.equipmentId])

  const addItem = () => {
    if (!draftItem.name.trim() || !draftItem.standard.trim()) return onMessage('请填写保养项目名称和标准')
    setItems((current) => [...current, { id: crypto.randomUUID(), ...draftItem }])
    setDraftItem({ name: '', standard: '' })
  }
  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.equipmentId) return onMessage('请填写计划编码、名称并选择设备')
    if (items.length === 0) return onMessage('至少添加一个保养项目')
    setSaving(true)
    try {
      await saveEquipmentMaintenancePlan({
        ...form, nextDueAt: new Date(form.nextDueAt), note: form.note || null,
        items: items.map(({ name, standard }) => ({ name, standard })),
      })
      onMessage('设备保养计划已创建'); await onSaved(); onClose()
    } catch (error) { onMessage(error instanceof Error ? error.message : '创建设备保养计划失败') }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog title="新建设备保养计划" description="建立不可改写的周期项目；到期后生成工单执行，完成工单才推进下一周期。" onClose={onClose} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={onClose} onConfirm={save} confirmLabel="创建计划" busy={saving} />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">计划编码 *<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 EM-CF-30D" /></label>
        <label className="text-sm font-medium text-gray-700">计划名称 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 冷镦机月度润滑保养" /></label>
        <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50">
          <ManyToOneRelationField
            title="适用设备" item={selectedEquipment}
            selector={<RelationSearch items={equipmentOptions} getKey={(item) => item.id} getLabel={(item) => `${item.code} · ${item.name}`} getKeywords={(item) => `${item.workCenter.code} ${item.workCenter.name} ${item.status}`} onSelect={(item) => setForm({ ...form, equipmentId: item.id })} placeholder="搜索设备编码、名称或工作中心" />}
            renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.code} · {item.name}</div><div className="text-xs text-gray-500">{item.workCenter.code} · {item.workCenter.name}</div></>}
            onRemove={() => setForm({ ...form, equipmentId: '' })} emptyText="请选择当前工作中心数据范围内的设备。"
          />
        </div>
        <label className="text-sm font-medium text-gray-700">周期（天） *<input type="number" min={1} max={3650} value={form.intervalDays} onChange={(event) => setForm({ ...form, intervalDays: Number(event.target.value) })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">首次到期时间 *<input type="datetime-local" value={form.nextDueAt} onChange={(event) => setForm({ ...form, nextDueAt: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">计划说明<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={2} className={`mt-2 ${appTextareaClassName}`} /></label>
      </div>
      <section className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">保养项目</h3><span className="text-xs text-gray-500">{items.length} 项</span></div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <input value={draftItem.name} onChange={(event) => setDraftItem({ ...draftItem, name: event.target.value })} className={appInputClassName} placeholder="项目名称" />
          <input value={draftItem.standard} onChange={(event) => setDraftItem({ ...draftItem, standard: event.target.value })} className={appInputClassName} placeholder="作业标准" />
          <AppButton size="sm" variant="create" onClick={addItem}>添加</AppButton>
        </div>
        {items.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">尚未添加保养项目。</div> : <ol className="mt-3 divide-y divide-gray-200">{items.map((item, index) => <li key={item.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[2rem_1fr_1.5fr_auto]"><span className="text-gray-400">{index + 1}</span><span className="font-medium text-gray-900">{item.name}</span><span className="text-gray-600">{item.standard}</span><button type="button" className="text-xs text-red-600" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}>移除</button></li>)}</ol>}
      </section>
    </ModalDialog>
  )
}
