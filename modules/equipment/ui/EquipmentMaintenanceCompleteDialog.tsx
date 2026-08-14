'use client'

import { useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { ManyToOneRelationField, RelationSearch } from '@/app/components/relations'
import { completeEquipmentMaintenanceWorkOrder } from '../client/equipment-maintenance-api'
import type { EquipmentMaintenanceMaterialOption, EquipmentMaintenanceWorkOrder } from '../contracts/equipment-maintenance'

type DraftSpare = {
  id: string
  materialId: string
  materialCode: string
  materialName: string
  stockUnit: string
  locationId: string
  locationCode: string
  locationName: string
  stockQty: number
  note: string
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function EquipmentMaintenanceCompleteDialog({ workOrder, materialOptions, onClose, onSaved, onMessage }: {
  workOrder: EquipmentMaintenanceWorkOrder
  materialOptions: EquipmentMaintenanceMaterialOption[]
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [completedAt, setCompletedAt] = useState(localDateTimeValue())
  const [workDescription, setWorkDescription] = useState('')
  const [failureCause, setFailureCause] = useState('')
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set())
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [draftLocationId, setDraftLocationId] = useState('')
  const [draftQty, setDraftQty] = useState(1)
  const [draftNote, setDraftNote] = useState('')
  const [spares, setSpares] = useState<DraftSpare[]>([])
  const [saving, setSaving] = useState(false)
  const selectedMaterial = useMemo(() => materialOptions.find((item) => item.id === selectedMaterialId), [materialOptions, selectedMaterialId])
  const selectedLocation = selectedMaterial?.locationBalances.find((item) => item.locationId === draftLocationId)
  const planItems = workOrder.plan?.items || []

  const chooseMaterial = (material: EquipmentMaintenanceMaterialOption) => {
    setSelectedMaterialId(material.id)
    setDraftLocationId(material.locationBalances.length === 1 ? material.locationBalances[0].locationId : '')
  }
  const addSpare = () => {
    if (!selectedMaterial || !selectedLocation) return onMessage('请选择备件和领用库位')
    if (!Number.isFinite(draftQty) || draftQty <= 0) return onMessage('备件数量必须大于 0')
    if (draftQty > selectedLocation.availableQty) return onMessage(`该库位可用库存仅 ${selectedLocation.availableQty} ${selectedMaterial.stockUnit}`)
    if (spares.some((item) => item.materialId === selectedMaterial.id && item.locationId === selectedLocation.locationId)) return onMessage('同一备件和库位只能添加一次')
    setSpares((current) => [...current, {
      id: crypto.randomUUID(), materialId: selectedMaterial.id, materialCode: selectedMaterial.code,
      materialName: selectedMaterial.name, stockUnit: selectedMaterial.stockUnit,
      locationId: selectedLocation.locationId, locationCode: selectedLocation.location.code,
      locationName: selectedLocation.location.name, stockQty: draftQty, note: draftNote,
    }])
    setSelectedMaterialId(''); setDraftLocationId(''); setDraftQty(1); setDraftNote('')
  }
  const save = async () => {
    if (!workDescription.trim()) return onMessage('请填写维修或保养内容')
    if (workOrder.kind === 'PREVENTIVE' && confirmedItems.size !== planItems.length) return onMessage('请逐项确认全部保养项目达标')
    setSaving(true)
    try {
      await completeEquipmentMaintenanceWorkOrder(workOrder.id, {
        operationId: crypto.randomUUID(), completedAt: new Date(completedAt), workDescription,
        failureCause: failureCause || null,
        items: planItems.map((item) => ({ planItemId: item.id, result: 'PASS' as const, note: null })),
        spares: spares.map((item) => ({ materialId: item.materialId, locationId: item.locationId, stockQty: item.stockQty, note: item.note || null })),
      })
      onMessage('工单已完成：设备恢复可用，备件库存与批次流水已同步过账'); await onSaved(); onClose()
    } catch (error) { onMessage(error instanceof Error ? error.message : '完成设备维修工单失败') }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog title={`完成工单 ${workOrder.workOrderNo}`} description="一次提交作业结果和备件领用；成功后设备恢复可用，库存、成本和批次同步过账。" onClose={onClose} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={onClose} onConfirm={save} confirmLabel="确认完成并过账" busy={saving} />}>
      <div className="space-y-5">
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="font-semibold text-gray-900">{workOrder.title}</div>
          <div className="mt-1 text-sm text-gray-600">{workOrder.equipment.code} · {workOrder.equipment.name} · {workOrder.equipment.workCenter.name}</div>
          {workOrder.faultDescription && <div className="mt-2 text-sm text-red-700">故障现象：{workOrder.faultDescription}</div>}
        </section>
        {workOrder.kind === 'PREVENTIVE' && <section className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900">保养清单</h3><span className="text-xs text-gray-500">已确认 {confirmedItems.size}/{planItems.length}</span></div>
          <ol className="mt-3 divide-y divide-gray-100">{planItems.map((item, index) => <li key={item.id} className="grid grid-cols-[auto_2rem_1fr] items-start gap-2 py-3 text-sm"><input aria-label={`确认${item.name}`} type="checkbox" className="mt-1 h-4 w-4" checked={confirmedItems.has(item.id)} onChange={(event) => setConfirmedItems((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next })} /><span className="text-gray-400">{index + 1}</span><div><div className="font-medium text-gray-900">{item.name}</div><div className="text-gray-600">{item.standard}</div></div></li>)}</ol>
        </section>}
        <section className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900">备件领用</h3><span className="text-xs text-gray-500">{spares.length} 项</span></div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50"><ManyToOneRelationField title="备件物料" item={selectedMaterial} selector={<RelationSearch items={materialOptions} getKey={(item) => item.id} getLabel={(item) => `${item.code} · ${item.name}`} getKeywords={(item) => `${item.spec || ''} ${item.locationBalances.map((balance) => balance.location.name).join(' ')}`} onSelect={chooseMaterial} placeholder="搜索有可用库存的备件" />} renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.code} · {item.name}</div><div className="text-xs text-gray-500">可用 {item.availableQty} {item.stockUnit}</div></>} onRemove={() => { setSelectedMaterialId(''); setDraftLocationId('') }} emptyText="可不领备件；需要时先搜索并选择物料。" /></div>
          {selectedMaterial && <div className="mt-3 grid gap-3 md:grid-cols-[1fr_8rem_1fr_auto]">
            <select value={draftLocationId} onChange={(event) => setDraftLocationId(event.target.value)} className={appSelectClassName}><option value="">选择库位</option>{selectedMaterial.locationBalances.map((balance) => <option key={balance.locationId} value={balance.locationId}>{balance.location.code} · {balance.location.name}（可用 {balance.availableQty}）</option>)}</select>
            <input type="number" min={0.000001} step="any" value={draftQty} onChange={(event) => setDraftQty(Number(event.target.value))} className={appInputClassName} aria-label="领用数量" />
            <input value={draftNote} onChange={(event) => setDraftNote(event.target.value)} className={appInputClassName} placeholder="用途说明（可选）" />
            <AppButton size="sm" variant="create" onClick={addSpare}>添加</AppButton>
          </div>}
          {spares.length > 0 && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">备件</th><th>库位</th><th>数量</th><th>说明</th><th /></tr></thead><tbody>{spares.map((item) => <tr key={item.id} className="border-b border-gray-100"><td className="py-2 font-medium">{item.materialCode} · {item.materialName}</td><td>{item.locationCode} · {item.locationName}</td><td>{item.stockQty} {item.stockUnit}</td><td>{item.note || '-'}</td><td className="text-right"><button type="button" className="text-xs text-red-600" onClick={() => setSpares((current) => current.filter((candidate) => candidate.id !== item.id))}>移除</button></td></tr>)}</tbody></table></div>}
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">完成时间 *<input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className={`mt-2 ${appInputClassName}`} /></label>
          {workOrder.kind === 'CORRECTIVE' && <label className="text-sm font-medium text-gray-700">故障原因<input value={failureCause} onChange={(event) => setFailureCause(event.target.value)} className={`mt-2 ${appInputClassName}`} placeholder="例如 联轴器紧固件松动" /></label>}
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">维修/保养内容 *<textarea value={workDescription} onChange={(event) => setWorkDescription(event.target.value)} rows={4} className={`mt-2 ${appTextareaClassName}`} placeholder="记录实际处理、更换、调整和试机确认结果" /></label>
        </div>
      </div>
    </ModalDialog>
  )
}
