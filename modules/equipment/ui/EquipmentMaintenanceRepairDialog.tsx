'use client'

import { useMemo, useState } from 'react'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { ManyToOneRelationField, RelationSearch } from '@/app/components/relations'
import { saveCorrectiveMaintenanceWorkOrder } from '../client/equipment-maintenance-api'
import type { EquipmentMaintenanceEquipmentOption } from '../contracts/equipment-maintenance'

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function EquipmentMaintenanceRepairDialog({ equipmentOptions, onClose, onSaved, onMessage }: {
  equipmentOptions: EquipmentMaintenanceEquipmentOption[]
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [form, setForm] = useState({ equipmentId: '', title: '', priority: 'NORMAL' as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT', faultDescription: '', assignedTo: '', dueAt: localDateTimeValue() })
  const [saving, setSaving] = useState(false)
  const selectedEquipment = useMemo(() => equipmentOptions.find((item) => item.id === form.equipmentId), [equipmentOptions, form.equipmentId])
  const save = async () => {
    if (!form.equipmentId || !form.title.trim() || !form.faultDescription.trim()) return onMessage('请选择设备并填写维修主题和故障现象')
    setSaving(true)
    try {
      await saveCorrectiveMaintenanceWorkOrder({
        operationId: crypto.randomUUID(), equipmentId: form.equipmentId, title: form.title,
        priority: form.priority, faultDescription: form.faultDescription, assignedTo: form.assignedTo || null,
        dueAt: form.dueAt ? new Date(form.dueAt) : null,
      })
      onMessage('设备维修工单已创建，故障设备已进入故障状态'); await onSaved(); onClose()
    } catch (error) { onMessage(error instanceof Error ? error.message : '创建设备维修工单失败') }
    finally { setSaving(false) }
  }
  return (
    <ModalDialog title="新建设备维修工单" description="登记真实故障现象；可用或运行中的设备会同步进入故障状态。" onClose={onClose} closeDisabled={saving} size="lg" footer={<ModalActions onCancel={onClose} onConfirm={save} confirmLabel="创建维修工单" busy={saving} />}>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50"><ManyToOneRelationField title="故障设备" item={selectedEquipment} selector={<RelationSearch items={equipmentOptions} getKey={(item) => item.id} getLabel={(item) => `${item.code} · ${item.name}`} getKeywords={(item) => `${item.workCenter.name} ${item.status}`} onSelect={(item) => setForm({ ...form, equipmentId: item.id })} placeholder="搜索设备" />} renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.code} · {item.name}</div><div className="text-xs text-gray-500">{item.workCenter.name} · {item.status}</div></>} onRemove={() => setForm({ ...form, equipmentId: '' })} emptyText="请选择发生故障的设备。" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">维修主题 *<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 主轴异响维修" /></label>
          <label className="text-sm font-medium text-gray-700">优先级<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as typeof form.priority })} className={`mt-2 ${appSelectClassName}`}><option value="LOW">低</option><option value="NORMAL">普通</option><option value="HIGH">高</option><option value="URGENT">紧急</option></select></label>
          <label className="text-sm font-medium text-gray-700">要求完成时间<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
          <label className="text-sm font-medium text-gray-700">负责人<input value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 设备组" /></label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">故障现象 *<textarea value={form.faultDescription} onChange={(event) => setForm({ ...form, faultDescription: event.target.value })} rows={4} className={`mt-2 ${appTextareaClassName}`} placeholder="描述声音、位置、报警、发生条件等客观现象" /></label>
        </div>
      </div>
    </ModalDialog>
  )
}
