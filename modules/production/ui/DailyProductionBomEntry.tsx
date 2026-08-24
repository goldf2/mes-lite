'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { MaterialRelationIdentity, MaterialRelationSearch, OneToManyRelationField } from '@/app/components/relations'
import { calculateProductionConsumption, type ProductionLossMode } from '@/lib/production-consumption'
import { loadInventoryLocations, type InventoryLocationOption } from '@/modules/inventory'
import {
  loadDailyProductionShortcutWorkspace,
  submitDailyProductionShortcut,
  type DailyProductionMaterialOption,
  type DailyProductionReportSummary,
} from '../client/daily-production-shortcut-api'
import { dailyProductionBomCandidates, dailyProductionInputMaterials } from '../model/daily-production-bom-selection'

type InputDraft = { locationId: string; lossMode: ProductionLossMode; lossValue: number; actualQty?: number }
type OutputDraft = { locationId: string; actualQty: number; isPrimary: boolean }

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')
const todayInShanghai = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export default function DailyProductionBomEntry({ canUpdate, onMessage }: { canUpdate: boolean; onMessage: (message: string) => void }) {
  const [materials, setMaterials] = useState<DailyProductionMaterialOption[]>([])
  const [reports, setReports] = useState<DailyProductionReportSummary[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [reportDate, setReportDate] = useState(todayInShanghai)
  const [inputMaterialId, setInputMaterialId] = useState('')
  const [bomId, setBomId] = useState('')
  const [inputs, setInputs] = useState<Record<string, InputDraft>>({})
  const [outputs, setOutputs] = useState<Record<string, OutputDraft>>({})
  const [outputDisposition, setOutputDisposition] = useState<'DIRECT_AVAILABLE' | 'QUALITY_INSPECTION'>('DIRECT_AVAILABLE')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [workspace, locationOptions] = await Promise.all([
        loadDailyProductionShortcutWorkspace(), loadInventoryLocations(),
      ])
      setMaterials(workspace.materials)
      setReports(workspace.reports)
      setLocations(locationOptions)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '读取快捷生产数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const defaultLocationId = locations.find((item) => item.isDefault)?.id || locations[0]?.id || ''
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials])
  const inputMaterials = useMemo(() => dailyProductionInputMaterials(materials), [materials])
  const bomCandidates = useMemo(() => dailyProductionBomCandidates(materials, inputMaterialId), [inputMaterialId, materials])
  const selectedCandidate = bomCandidates.find((candidate) => candidate.bom.id === bomId)
    || dailyProductionBomCandidates(materials, '').find((candidate) => candidate.bom.id === bomId)
  const selectedBom = selectedCandidate?.bom || null
  const primaryMaterialId = Object.entries(outputs).find(([, output]) => output.isPrimary)?.[0] || ''
  const primaryActualQty = Number(outputs[primaryMaterialId]?.actualQty || 0)
  const presetPrimary = selectedBom?.outputs.find((output) => output.isPrimary) || null
  const primaryBasis = Number(presetPrimary?.quantity || selectedBom?.outputQuantity || 1)
  const batchFactor = primaryBasis > 0 ? primaryActualQty / primaryBasis : 0

  const calculatedInputs = useMemo(() => Object.keys(inputs).map((materialId) => {
    const draft = inputs[materialId]
    const material = materialById.get(materialId)
    const relations = (selectedBom?.items || []).filter((item) => item.material?.id === materialId)
    const shared = relations.filter((item) => !item.outputMaterialId)
    const plannedBaseQty = shared.length > 0
      ? shared.reduce((sum, item) => sum + Number(item.quantity), 0) * batchFactor
      : relations.reduce((sum, item) => {
          const target = selectedBom?.outputs.find((output) => output.materialId === item.outputMaterialId)
          const targetActual = Number(outputs[target?.materialId || '']?.actualQty || 0)
          return Number(target?.quantity || 0) > 0 ? sum + targetActual * Number(item.quantity) / Number(target!.quantity) : sum
        }, 0)
    const calculated = plannedBaseQty > 0 && primaryActualQty > 0
      ? calculateProductionConsumption({
          outputQty: primaryActualQty,
          unitConsumption: plannedBaseQty / primaryActualQty,
          lossMode: draft.lossMode,
          lossValue: Number(draft.lossValue || 0),
          actualQty: Number(draft.actualQty || 0) > 0 ? Number(draft.actualQty) : undefined,
        })
      : { baseQty: 0, lossQty: 0, plannedQty: 0, actualQty: Number(draft.actualQty || 0) }
    return { materialId, material, relations, draft, calculated, unit: relations[0]?.unit || material?.stockUnit || material?.unit || '' }
  }), [batchFactor, inputs, materialById, outputs, primaryActualQty, selectedBom])

  function applyBom(nextBomId: string) {
    setBomId(nextBomId)
    if (!nextBomId) return
    const candidate = dailyProductionBomCandidates(materials, '').find((item) => item.bom.id === nextBomId)
    if (!candidate) return
    const bom = candidate.bom
    const presetOutputs = bom.outputs.length > 0 ? bom.outputs : [{
      materialId: candidate.outputMaterial.id, quantity: bom.outputQuantity, isPrimary: true,
    }]
    setOutputs(Object.fromEntries(presetOutputs.map((output) => [output.materialId, {
      locationId: defaultLocationId, actualQty: Number(output.quantity), isPrimary: Boolean(output.isPrimary),
    }])))
    const inputIds = Array.from(new Set(bom.items.flatMap((item) => item.material ? [item.material.id] : [])))
    setInputs(Object.fromEntries(inputIds.map((materialId) => [materialId, {
      locationId: defaultLocationId, lossMode: 'PERCENT' as const, lossValue: 0,
    }])))
  }

  function addOutput(materialId: string) {
    setOutputs((current) => ({
      ...current,
      [materialId]: { locationId: defaultLocationId, actualQty: 0, isPrimary: Object.keys(current).length === 0 },
    }))
  }

  async function submit() {
    if (!canUpdate) return onMessage('当前账号没有库存过账权限')
    if (!primaryMaterialId || primaryActualQty <= 0) return onMessage('请添加并指定一项数量大于 0 的主产出')
    if (Object.keys(inputs).length === 0 || calculatedInputs.some((line) => line.calculated.actualQty <= 0)) return onMessage('请至少添加一项数量大于 0 的实际投入')
    if (Object.values(inputs).some((line) => !line.locationId) || Object.values(outputs).some((line) => !line.locationId)) return onMessage('请选择每项投入和产出的库位')
    const presetInputIds = new Set((selectedBom?.items || []).flatMap((item) => item.material ? [item.material.id] : []))
    const presetOutputIds = new Set((selectedBom?.outputs || []).map((item) => item.materialId))
    const inputIds = new Set(Object.keys(inputs)); const outputIds = new Set(Object.keys(outputs))
    const hasDeviation = !selectedBom
      || Object.keys(inputs).some((id) => !presetInputIds.has(id))
      || Object.keys(outputs).some((id) => !presetOutputIds.has(id))
      || Array.from(presetInputIds).some((id) => !inputIds.has(id))
      || Array.from(presetOutputIds).some((id) => !outputIds.has(id))
    if (hasDeviation && note.trim().length < 2) return onMessage('无 BOM 或计划外投入产出必须填写备注')
    setSaving(true)
    try {
      const result = await submitDailyProductionShortcut({
        reportDate, bomId: bomId || undefined, outputDisposition, note: note.trim() || undefined,
        consumptions: calculatedInputs.map((line) => ({
          materialId: line.materialId, locationId: line.draft.locationId,
          lossMode: line.draft.lossMode, lossValue: Number(line.draft.lossValue || 0), actualQty: Number(line.calculated.actualQty),
        })),
        outputs: Object.entries(outputs).map(([materialId, output]) => ({ materialId, ...output })),
      })
      onMessage(result.message)
      if (!result.ok) return
      setBomId(''); setInputMaterialId(''); setInputs({}); setOutputs({}); setNote('')
      await loadData()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '快捷生产过账失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading && materials.length === 0) return <AppLoadingIndicator label="正在读取物料、BOM 与生产日报..." />
  const locationOptions = locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))

  return <div className="space-y-4">
    <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
      <h2 className="text-base font-semibold">快捷生产 / 转换过账</h2>
      <p className="mt-1 leading-6">BOM 是可选预设。可按投入物料反查已发布 BOM，也可不选 BOM，直接登记本次实际投入与多个实际产出；系统按整笔事务同步库存。</p>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="text-sm font-medium text-gray-700">生产日期<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className={`${appInputClassName} mt-2`} /></label>
        <div><label className="mb-2 block text-sm font-medium text-gray-700">按投入物料筛选 BOM（可选）</label><SearchableSelect value={inputMaterialId} onChange={setInputMaterialId} options={inputMaterials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}${item.spec ? ` · ${item.spec}` : ''}` }))} placeholder="输入物料编码、名称或规格" allowClear /></div>
        <div><label className="mb-2 block text-sm font-medium text-gray-700">BOM 预设（可选）</label><SearchableSelect value={bomId} onChange={applyBom} options={bomCandidates.map(({ bom, outputMaterial }) => ({ value: bom.id, label: `${outputMaterial.code} · ${outputMaterial.name} ← ${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''}` }))} placeholder={inputMaterialId ? '选择匹配投入的已发布 BOM' : '选择已发布 BOM，或保持无 BOM'} emptyText="没有匹配的已发布 BOM" allowClear /></div>
        <label className="text-sm font-medium text-gray-700">产出处置<select value={outputDisposition} onChange={(event) => setOutputDisposition(event.target.value as typeof outputDisposition)} className={`${appInputClassName} mt-2 bg-white`}><option value="DIRECT_AVAILABLE">直接进入可用库存</option><option value="QUALITY_INSPECTION">进入待检并生成质量任务</option></select></label>
      </div>
      <label className="mt-4 block text-sm font-medium text-gray-700">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className={`${appTextareaClassName} mt-2`} placeholder="无 BOM 或计划外投入产出时必填；也可记录班次、补录原因" /></label>
    </section>

    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"><div><h3 className="font-semibold text-gray-900">实际投入 / 产出</h3><p className="mt-0.5 text-xs text-gray-500">BOM 只负责预填；保存的是本次实际明细</p></div><AppButton variant="primary" onClick={() => void submit()} disabled={saving || !canUpdate || !primaryMaterialId}>{saving ? '正在原子过账...' : '确认实际投入并产出'}</AppButton></div>
      <div className="grid xl:grid-cols-2 xl:divide-x">
        <OneToManyRelationField
          title="实际投入"
          items={calculatedInputs}
          getKey={(line) => line.materialId}
          emptyText="请添加本次实际消耗的物料"
          selector={<MaterialRelationSearch materials={materials} disabledIds={Object.keys(inputs)} onAdd={(materialId) => setInputs((current) => ({ ...current, [materialId]: { locationId: defaultLocationId, lossMode: 'PERCENT', lossValue: 0, actualQty: 0 } }))} placeholder="添加投入物料" />}
          renderIdentity={({ materialId, material, relations, draft, calculated, unit }) => <div><MaterialRelationIdentity material={material} fallbackId={materialId} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${relations.length ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{relations.length ? 'BOM 预设' : '临时添加'}</span>} /><div className="mt-3 grid gap-2 sm:grid-cols-2"><SearchableSelect value={draft.locationId} onChange={(locationId) => setInputs((current) => ({ ...current, [materialId]: { ...current[materialId], locationId } }))} options={locationOptions} placeholder="来源库位" /><input aria-label={`实际投入 ${material?.name || materialId}`} type="number" min="0.000001" step="0.000001" value={draft.actualQty || ''} onChange={(event) => setInputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: Number(event.target.value) } }))} className={appInputClassName} placeholder={calculated.plannedQty > 0 ? `计划 ${numberText(calculated.plannedQty)} ${unit}` : `实际数量 ${unit}`} /></div><div className="mt-2 text-xs text-gray-500">{relations.length ? `BOM 计划 ${numberText(calculated.plannedQty)} ${unit}；可按实耗覆盖` : '无 BOM 计划数，按实际数量领用'}</div></div>}
          onRemove={(line) => setInputs((current) => { const next = { ...current }; delete next[line.materialId]; return next })}
        />
        <OneToManyRelationField
          title="实际产出"
          items={Object.keys(outputs)}
          getKey={(materialId) => materialId}
          emptyText="请添加至少一项实际产出"
          selector={<MaterialRelationSearch materials={materials} disabledIds={Object.keys(outputs)} onAdd={addOutput} placeholder="添加主产品、副产品、回收料或其它产出" />}
          renderIdentity={(materialId) => {
            const material = materialById.get(materialId); const draft = outputs[materialId]
            const preset = selectedBom?.outputs.find((output) => output.materialId === materialId)
            const unit = preset?.unit || material?.stockUnit || material?.unit || ''
            return <div><MaterialRelationIdentity material={material} fallbackId={materialId} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${draft.isPrimary ? 'bg-emerald-50 text-emerald-700' : preset ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{draft.isPrimary ? '主产出' : preset ? 'BOM 预设' : '临时添加'}</span>} /><div className="mt-3 grid gap-2 sm:grid-cols-2"><SearchableSelect value={draft.locationId} onChange={(locationId) => setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], locationId } }))} options={locationOptions} placeholder="入库库位" /><input aria-label={`实际产出 ${material?.name || materialId}`} type="number" min="0.000001" step="0.000001" value={draft.actualQty || ''} onChange={(event) => setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: Number(event.target.value) } }))} className={appInputClassName} placeholder={`实际数量 ${unit}`} /></div>{!draft.isPrimary && !selectedBom && <button type="button" onClick={() => setOutputs((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, { ...item, isPrimary: id === materialId }]))) } className="mt-2 text-xs font-medium text-blue-600">设为主产出</button>}<div className="mt-2 text-xs text-gray-500">{preset ? `BOM 比例计划 ${numberText(Number(preset.quantity) * batchFactor)} ${unit}` : '无 BOM 计划数，作为本次实际产出'}</div></div>
          }}
          onRemove={(materialId) => outputs[materialId].isPrimary ? onMessage('请先将另一项设为主产出，再移除当前主产出') : setOutputs((current) => { const next = { ...current }; delete next[materialId]; return next })}
        />
      </div>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><h3 className="font-semibold text-gray-900">最近生产 / 转换记录</h3><div className="mt-3 space-y-2">{reports.slice(0, 8).map((report) => {
      const reportOutputs = report.outputs?.length ? report.outputs : [{ id: report.id, materialCode: report.finishedMaterial.code, materialName: report.finishedMaterial.name, actualQty: report.outputQty, unit: report.finishedMaterial.stockUnit || report.finishedMaterial.unit, isPrimary: true, location: report.outputLocation || { code: '', name: '' } }]
      return <div key={report.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-medium text-gray-900">{report.reportNo}</span><span className="ml-2 text-gray-600">{report.bomName || '临时生产'} {report.bomVersion || ''}</span></div><div className="text-emerald-700">产出 {reportOutputs.map((item) => `${item.materialCode} · ${numberText(item.actualQty)} ${item.unit}`).join('；')}</div></div><div className="mt-1 text-xs leading-5 text-gray-600">投入 {report.consumptions.map((item) => `${item.materialCode} · ${numberText(item.actualQty)} ${item.unit}`).join('；') || '无'}{report.qualityInspection ? `；质检 ${report.qualityInspection.inspectionNo} · ${report.qualityInspection.status}` : '；直接可用'}</div></div>
    })}{reports.length === 0 && <div className="py-5 text-center text-sm text-gray-500">暂无记录</div>}</div></section>
  </div>
}
