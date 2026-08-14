'use client'

import { useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { ManyToOneRelationField, RelationSearch } from '@/app/components/relations'
import { saveQualityInspectionStandard } from '../client/quality-inspection-standard-api'
import type { QualityInspectionStandardInput } from '../contracts/quality-inspection-standard-schema'
import type { QualityInspectionMaterialOption, QualityInspectionStandardView } from '../contracts/quality-inspection-standard'

type DraftItem = { id: string; name: string; method: string; acceptanceCriteria: string }

export default function QualityInspectionStandardDialog({ standard, materials, onClose, onSaved, onMessage }: {
  standard?: QualityInspectionStandardView
  materials: QualityInspectionMaterialOption[]
  onClose: () => void
  onSaved: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [form, setForm] = useState({
    code: standard?.code || '', name: standard?.name || '', materialId: standard?.materialId || '',
    sourceType: standard?.sourceType || 'PRODUCTION_ORDER_ACTUAL_OUTPUT', samplingMode: standard?.samplingMode || 'FIXED',
    sampleValue: standard?.sampleValue ?? 1, minSampleQty: standard?.minSampleQty?.toString() || '',
    maxSampleQty: standard?.maxSampleQty?.toString() || '', changeReason: standard?.changeReason || '',
  })
  const [items, setItems] = useState<DraftItem[]>(standard?.items.map((item) => ({ ...item })) || [])
  const [draftItem, setDraftItem] = useState({ name: '', method: '', acceptanceCriteria: '' })
  const [saving, setSaving] = useState(false)
  const selectedMaterial = useMemo(() => materials.find((item) => item.id === form.materialId), [form.materialId, materials])
  const lockedIdentity = Boolean(standard)

  const addItem = () => {
    if (!draftItem.name.trim() || !draftItem.method.trim() || !draftItem.acceptanceCriteria.trim()) return onMessage('请填写检验项目、方法和接收标准')
    setItems((current) => [...current, { id: crypto.randomUUID(), ...draftItem }])
    setDraftItem({ name: '', method: '', acceptanceCriteria: '' })
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.materialId) return onMessage('请填写标准编码、名称并选择适用物料')
    if (!form.changeReason.trim()) return onMessage('请填写建立或变更原因')
    if (items.length === 0) return onMessage('至少添加一个检验项目')
    setSaving(true)
    try {
      const input: QualityInspectionStandardInput = {
        code: form.code, name: form.name, materialId: form.materialId,
        sourceType: form.sourceType as QualityInspectionStandardInput['sourceType'],
        samplingMode: form.samplingMode as QualityInspectionStandardInput['samplingMode'],
        sampleValue: form.samplingMode === 'FULL' ? 0 : Number(form.sampleValue),
        minSampleQty: form.minSampleQty === '' ? null : Number(form.minSampleQty),
        maxSampleQty: form.maxSampleQty === '' ? null : Number(form.maxSampleQty),
        changeReason: form.changeReason,
        items: items.map(({ name, method, acceptanceCriteria }) => ({ name, method, acceptanceCriteria })),
      }
      await saveQualityInspectionStandard(input, standard?.id)
      onMessage(standard ? '检验标准草稿已更新' : '检验标准草稿已创建')
      await onSaved()
      onClose()
    } catch (error) { onMessage(error instanceof Error ? error.message : '保存检验标准失败') }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog title={standard ? `编辑 ${standard.code} v${standard.version}` : '新建检验标准'} description="标准仅在草稿阶段可修改；发布后新检验任务会自动快照标准与抽样规则。" onClose={onClose} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={onClose} onConfirm={save} confirmLabel="保存草稿" busy={saving} />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">标准编码 *<input value={form.code} disabled={lockedIdentity} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 QIS-FG-01" /></label>
        <label className="text-sm font-medium text-gray-700">标准名称 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="例如 成品出厂检验" /></label>
        <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50">
          {lockedIdentity ? <div className="p-4"><div className="text-xs font-medium text-gray-500">适用物料（版本建立后不可更换）</div><div className="mt-2 text-sm font-medium text-gray-900">{selectedMaterial?.code} · {selectedMaterial?.name}</div><div className="text-xs text-gray-500">库存单位 {selectedMaterial?.stockUnit}</div></div> : <ManyToOneRelationField title="适用物料" item={selectedMaterial} selector={<RelationSearch items={materials} getKey={(item) => item.id} getLabel={(item) => `${item.code} · ${item.name}`} getKeywords={(item) => item.stockUnit} onSelect={(item) => setForm({ ...form, materialId: item.id })} placeholder="搜索物料编码或名称" />} renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.code} · {item.name}</div><div className="text-xs text-gray-500">库存单位 {item.stockUnit}</div></>} onRemove={() => setForm({ ...form, materialId: '' })} emptyText="请选择检验标准适用的物料。" />}
        </div>
        <label className="text-sm font-medium text-gray-700">任务来源 *<select value={form.sourceType} disabled={lockedIdentity} onChange={(event) => setForm({ ...form, sourceType: event.target.value as typeof form.sourceType })} className={`mt-2 ${appSelectClassName}`}><option value="PRODUCTION_ORDER_ACTUAL_OUTPUT">生产入库待检</option><option value="RETURN_ORDER">退货入库待检</option></select></label>
        <label className="text-sm font-medium text-gray-700">抽样模式 *<select value={form.samplingMode} onChange={(event) => setForm({ ...form, samplingMode: event.target.value as typeof form.samplingMode })} className={`mt-2 ${appSelectClassName}`}><option value="FULL">全检</option><option value="FIXED">固定数量</option><option value="PERCENTAGE">按比例</option></select></label>
        {form.samplingMode !== 'FULL' && <label className="text-sm font-medium text-gray-700">{form.samplingMode === 'PERCENTAGE' ? '抽样比例（%）' : '固定抽样数'} *<input type="number" min="0.000001" max={form.samplingMode === 'PERCENTAGE' ? 100 : undefined} step="0.000001" value={form.sampleValue} onChange={(event) => setForm({ ...form, sampleValue: Number(event.target.value) })} className={`mt-2 ${appInputClassName}`} /></label>}
        <label className="text-sm font-medium text-gray-700">最低抽样数<input type="number" min="0" step="0.000001" value={form.minSampleQty} onChange={(event) => setForm({ ...form, minSampleQty: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="可选" /></label>
        <label className="text-sm font-medium text-gray-700">最高抽样数<input type="number" min="0.000001" step="0.000001" value={form.maxSampleQty} onChange={(event) => setForm({ ...form, maxSampleQty: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="可选" /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">建立或变更原因 *<textarea value={form.changeReason} onChange={(event) => setForm({ ...form, changeReason: event.target.value })} rows={2} className={`mt-2 ${appTextareaClassName}`} placeholder="说明新建标准或本版修订的原因" /></label>
      </div>
      <section className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">检验项目</h3><span className="text-xs text-gray-500">{items.length} 项</span></div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr_1.5fr_auto]">
          <input value={draftItem.name} onChange={(event) => setDraftItem({ ...draftItem, name: event.target.value })} className={appInputClassName} placeholder="项目名称" />
          <input value={draftItem.method} onChange={(event) => setDraftItem({ ...draftItem, method: event.target.value })} className={appInputClassName} placeholder="检验方法" />
          <input value={draftItem.acceptanceCriteria} onChange={(event) => setDraftItem({ ...draftItem, acceptanceCriteria: event.target.value })} className={appInputClassName} placeholder="接收标准" />
          <AppButton size="sm" variant="create" onClick={addItem}>添加</AppButton>
        </div>
        {items.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">尚未添加检验项目。</div> : <ol className="mt-3 divide-y divide-gray-200">{items.map((item, index) => <li key={item.id} className="grid gap-2 py-3 text-sm lg:grid-cols-[2rem_1fr_1.2fr_1.5fr_auto]"><span className="text-gray-400">{index + 1}</span><span className="font-medium text-gray-900">{item.name}</span><span className="text-gray-600">{item.method}</span><span className="text-gray-600">{item.acceptanceCriteria}</span><button type="button" className="text-xs text-red-600" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}>移除</button></li>)}</ol>}
      </section>
    </ModalDialog>
  )
}
