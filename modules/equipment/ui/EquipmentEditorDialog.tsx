'use client'

import { useState } from 'react'
import SearchableSelect from '@/app/components/SearchableSelect'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { saveEquipment } from '../client/equipment-api'
import type { EquipmentItem, EquipmentWorkCenterOption } from '../contracts/equipment'
import { createEmptyEquipmentForm } from '../model/equipment-view'

export default function EquipmentEditorDialog({
  equipment, workCenters, onClose, onSaved, onMessage,
}: {
  equipment: EquipmentItem | null
  workCenters: EquipmentWorkCenterOption[]
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [form, setForm] = useState(() => equipment ? {
    code: equipment.code, name: equipment.name, equipmentType: equipment.equipmentType,
    workCenterId: equipment.workCenterId, model: equipment.model || '', manufacturer: equipment.manufacturer || '',
    serialNumber: equipment.serialNumber || '', location: equipment.location || '',
    basicParameters: equipment.basicParameters || '', note: equipment.note || '',
  } : { ...createEmptyEquipmentForm(), workCenterId: workCenters[0]?.id || '' })
  const [saving, setSaving] = useState(false)
  const workCenterOptions = workCenters.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: item.name }))

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.equipmentType.trim() || !form.workCenterId) {
      return onMessage('请填写设备编码、名称、类型并选择工作中心')
    }
    setSaving(true)
    try {
      await saveEquipment(form, equipment?.id)
      onMessage(equipment ? '设备基础资料已更新' : '设备已新增')
      await onSaved()
      onClose()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存设备失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog title={equipment ? '编辑设备基础资料' : '新建设备'} description="运行状态只能通过设备事件命令改变，基础资料编辑不会改写现场状态。" onClose={onClose} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={onClose} onConfirm={save} busy={saving} />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-gray-700">设备编码 *<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">设备名称 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">设备类型 *<input value={form.equipmentType} onChange={(event) => setForm({ ...form, equipmentType: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="如 锯床、钻床" /></label>
        <label className="text-sm font-medium text-gray-700">工作中心 *<div className="mt-2"><SearchableSelect value={form.workCenterId} onChange={(workCenterId) => setForm({ ...form, workCenterId })} options={workCenterOptions} placeholder="输入工作中心筛选" /></div></label>
        <label className="text-sm font-medium text-gray-700">现场位置<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">制造商<input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">型号<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="text-sm font-medium text-gray-700">出厂编号<input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
        <label className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-gray-700">基础参数<textarea value={form.basicParameters} onChange={(event) => setForm({ ...form, basicParameters: event.target.value })} rows={4} className={`mt-2 ${appTextareaClassName}`} placeholder={'例如：\n最大加工尺寸：...\n主轴功率：...\n能力范围：...'} /></label>
        <label className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-gray-700">备注<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className={`mt-2 ${appTextareaClassName}`} /></label>
      </div>
    </ModalDialog>
  )
}
