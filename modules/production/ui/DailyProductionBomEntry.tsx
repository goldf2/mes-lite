'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { MaterialRelationIdentity, MaterialRelationSearch, OneToManyRelationField } from '@/app/components/relations'
import { calculateProductionConsumption, type ProductionLossMode } from '@/lib/production-consumption'
import { loadInventoryLocations, type InventoryLocationOption } from '@/modules/inventory'
import {
  loadDailyProductionShortcutWorkspace,
  reverseDailyProductionShortcut,
  submitDailyProductionShortcut,
  type DailyProductionMaterialOption,
  type DailyProductionReportSummary,
} from '../client/daily-production-shortcut-api'
import {
  dailyProductionBomCandidates,
  dailyProductionInputMaterials,
  dailyProductionOutputMaterials,
} from '../model/daily-production-bom-selection'

type InputDraft = { locationId: string; lossMode: ProductionLossMode; lossValue: number; actualQty?: number }
type OutputDraft = { locationId: string; actualQty?: number; isPrimary: boolean }

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')
function InventoryReference({
  material,
  locationId,
  requestedQty,
  direction,
}: {
  material?: DailyProductionMaterialOption
  locationId: string
  requestedQty?: number
  direction: 'INPUT' | 'OUTPUT'
}) {
  if (!material) return null
  const locationAvailable = Number(material.inventory.locationBalances.find((item) => item.locationId === locationId)?.availableQty || 0)
  const totalAvailable = Number(material.inventory.availableQty || 0)
  const insufficient = direction === 'INPUT' && Number(requestedQty || 0) > locationAvailable + 0.000001
  const unit = material.stockUnit || material.unit
  return <div className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${insufficient ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
    库存参考：{direction === 'INPUT' ? '来源库位可用' : '目标库位入库前可用'} {numberText(locationAvailable)} {unit}；{material.inventory.restricted ? '权限范围总可用' : '总可用'} {numberText(totalAvailable)} {unit}
  </div>
}
const dateTimeText = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { hour12: false })
  : '—'
const reportStatusMeta: Record<string, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-emerald-50 text-emerald-700' },
  REVERSED: { label: '已冲销', className: 'bg-red-50 text-red-700' },
}
const todayInShanghai = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export default function DailyProductionBomEntry({
  canUpdate,
  canReverse,
  onMessage,
}: {
  canUpdate: boolean
  canReverse: boolean
  onMessage: (message: string) => void
}) {
  const [materials, setMaterials] = useState<DailyProductionMaterialOption[]>([])
  const [reports, setReports] = useState<DailyProductionReportSummary[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [reportDate, setReportDate] = useState(todayInShanghai)
  const [outputMaterialId, setOutputMaterialId] = useState('')
  const [inputMaterialId, setInputMaterialId] = useState('')
  const [bomId, setBomId] = useState('')
  const [plannedOutputQty, setPlannedOutputQty] = useState(0)
  const [inputs, setInputs] = useState<Record<string, InputDraft>>({})
  const [outputs, setOutputs] = useState<Record<string, OutputDraft>>({})
  const [outputDisposition, setOutputDisposition] = useState<'DIRECT_AVAILABLE' | 'QUALITY_INSPECTION'>('DIRECT_AVAILABLE')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reversing, setReversing] = useState<DailyProductionReportSummary | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversingReport, setReversingReport] = useState(false)

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
  const outputMaterials = useMemo(() => dailyProductionOutputMaterials(materials), [materials])
  const inputMaterials = useMemo(() => dailyProductionInputMaterials(materials), [materials])
  const bomCandidates = useMemo(() => dailyProductionBomCandidates(materials, {
    outputMaterialId,
    inputMaterialId,
  }), [inputMaterialId, materials, outputMaterialId])
  const selectedCandidate = bomCandidates.find((candidate) => candidate.bom.id === bomId)
    || dailyProductionBomCandidates(materials).find((candidate) => candidate.bom.id === bomId)
  const selectedBom = selectedCandidate?.bom || null
  const primaryMaterialId = Object.entries(outputs).find(([, output]) => output.isPrimary)?.[0] || ''
  const presetPrimary = selectedBom?.outputs.find((output) => output.isPrimary) || null
  const primaryBasis = Number(presetPrimary?.quantity || selectedBom?.outputQuantity || 1)
  const batchFactor = selectedBom && primaryBasis > 0 ? Number(plannedOutputQty || 0) / primaryBasis : 0
  const plannedOutputQuantity = (materialId: string) => {
    const preset = selectedBom?.outputs.find((output) => output.materialId === materialId)
    return preset ? Number(preset.quantity) * batchFactor : 0
  }
  const effectiveOutputQuantity = (materialId: string) => {
    const actualQty = outputs[materialId]?.actualQty
    return actualQty === undefined ? plannedOutputQuantity(materialId) : Number(actualQty)
  }
  const primaryActualQty = effectiveOutputQuantity(primaryMaterialId)

  const calculatedInputs = useMemo(() => Object.keys(inputs).map((materialId) => {
    const draft = inputs[materialId]
    const material = materialById.get(materialId)
    const relations = (selectedBom?.items || []).filter((item) => item.material?.id === materialId)
    const shared = relations.filter((item) => !item.outputMaterialId)
    const plannedBaseQty = shared.length > 0
      ? shared.reduce((sum, item) => sum + Number(item.quantity), 0) * batchFactor
      : relations.reduce((sum, item) => sum + Number(item.quantity) * batchFactor, 0)
    const calculated = plannedBaseQty > 0 && plannedOutputQty > 0
      ? calculateProductionConsumption({
          outputQty: plannedOutputQty,
          unitConsumption: plannedBaseQty / plannedOutputQty,
          lossMode: draft.lossMode,
          lossValue: Number(draft.lossValue || 0),
          actualQty: draft.actualQty !== undefined && Number(draft.actualQty) > 0 ? Number(draft.actualQty) : undefined,
        })
      : { baseQty: 0, lossQty: 0, plannedQty: 0, actualQty: Number(draft.actualQty || 0) }
    return { materialId, material, relations, draft, calculated, unit: relations[0]?.unit || material?.stockUnit || material?.unit || '' }
  }), [batchFactor, inputs, materialById, plannedOutputQty, selectedBom])

  function applyBom(nextBomId: string) {
    setBomId(nextBomId)
    if (!nextBomId) {
      setPlannedOutputQty(0)
      return
    }
    const candidate = dailyProductionBomCandidates(materials).find((item) => item.bom.id === nextBomId)
    if (!candidate) return
    const bom = candidate.bom
    const presetOutputs = bom.outputs.length > 0 ? bom.outputs : [{
      materialId: candidate.outputMaterial.id, quantity: bom.outputQuantity, isPrimary: true,
    }]
    const primaryOutput = presetOutputs.find((output) => output.isPrimary) || presetOutputs[0]
    setPlannedOutputQty(Number(primaryOutput?.quantity || bom.outputQuantity || 0))
    setOutputs(Object.fromEntries(presetOutputs.map((output) => [output.materialId, {
      locationId: defaultLocationId, actualQty: undefined, isPrimary: Boolean(output.isPrimary),
    }])))
    const inputIds = Array.from(new Set(bom.items.flatMap((item) => item.material ? [item.material.id] : [])))
    setInputs(Object.fromEntries(inputIds.map((materialId) => [materialId, {
      locationId: defaultLocationId, lossMode: 'PERCENT' as const, lossValue: 0,
    }])))
  }

  function addOutput(materialId: string) {
    setOutputs((current) => ({
      ...current,
      [materialId]: { locationId: defaultLocationId, actualQty: undefined, isPrimary: Object.keys(current).length === 0 },
    }))
  }

  async function reverseReport() {
    if (!reversing) return
    if (!reverseReason.trim()) return onMessage('请填写冲销原因')
    setReversingReport(true)
    try {
      const result = await reverseDailyProductionShortcut(reversing.id, reverseReason.trim())
      onMessage(result.message)
      if (!result.ok) return
      setReversing(null)
      setReverseReason('')
      await loadData()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '生产日报冲销失败')
    } finally {
      setReversingReport(false)
    }
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
        outputs: Object.entries(outputs).map(([materialId, output]) => ({
          materialId,
          locationId: output.locationId,
          actualQty: effectiveOutputQuantity(materialId),
          isPrimary: output.isPrimary,
        })),
      })
      onMessage(result.message)
      if (!result.ok) return
      setBomId(''); setPlannedOutputQty(0); setOutputMaterialId(''); setInputMaterialId(''); setInputs({}); setOutputs({}); setNote('')
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
      <p className="mt-1 leading-6">BOM 是可选预设。先选择计划产出和合适的 BOM；系统把预设数量直接填入下方实际投入与实际产出，操作员可在原位置审核、修正后确认过账。</p>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium text-gray-700">生产日期<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className={`${appInputClassName} mt-2`} /></label>
        <div><label className="mb-2 block text-sm font-medium text-gray-700">按计划产出筛选 BOM（推荐）</label><SearchableSelect value={outputMaterialId} onChange={setOutputMaterialId} options={outputMaterials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}${item.spec ? ` · ${item.spec}` : ''}` }))} placeholder="选择准备生产的主产品、副产品或其它产出" allowClear /></div>
        <div><label className="mb-2 block text-sm font-medium text-gray-700">选择生产方案（BOM）</label><SearchableSelect value={bomId} onChange={applyBom} options={bomCandidates.map(({ bom, outputMaterial, matchedOutputMaterial }) => ({ value: bom.id, label: `${matchedOutputMaterial.code} · ${matchedOutputMaterial.name}${matchedOutputMaterial.id === outputMaterial.id ? '' : `（主产出 ${outputMaterial.code}）`} ← ${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''}` }))} placeholder={outputMaterialId && inputMaterialId ? '选择同时匹配产出与投入的已发布 BOM' : outputMaterialId ? '选择能够形成该产出的已发布 BOM' : inputMaterialId ? '选择包含该投入的已发布 BOM' : '选择已发布 BOM，或保持无 BOM'} emptyText={outputMaterialId && inputMaterialId ? '没有同时满足当前条件的已发布 BOM' : outputMaterialId ? '没有能形成该产出的已发布 BOM' : inputMaterialId ? '没有包含该投入的已发布 BOM' : '暂无已发布 BOM'} allowClear /></div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div><label className="mb-2 block text-sm font-medium text-gray-700">按已有投入物料辅助筛选（可选）</label><SearchableSelect value={inputMaterialId} onChange={setInputMaterialId} options={inputMaterials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}${item.spec ? ` · ${item.spec}` : ''}` }))} placeholder="选择现场已有或准备投入的物料" allowClear /></div>
        <label className="text-sm font-medium text-gray-700">产出处置<select value={outputDisposition} onChange={(event) => setOutputDisposition(event.target.value as typeof outputDisposition)} className={`${appInputClassName} mt-2 bg-white`}><option value="DIRECT_AVAILABLE">直接进入可用库存</option><option value="QUALITY_INSPECTION">进入待检并生成质量任务</option></select></label>
      </div>
      <label className="mt-4 block text-sm font-medium text-gray-700">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className={`${appTextareaClassName} mt-2`} placeholder="无 BOM 或计划外投入产出时必填；也可记录班次、补录原因" /></label>
    </section>

    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"><div><h3 className="font-semibold text-gray-900">实际投入 / 产出</h3><p className="mt-0.5 text-xs text-gray-500">BOM 数量直接作为可编辑初值；修改主产出会同比例重算尚未手工修正的其它行</p></div><AppButton variant="primary" onClick={() => void submit()} disabled={saving || !canUpdate || !primaryMaterialId}>{saving ? '正在原子过账...' : '确认实际投入并产出'}</AppButton></div>
      <div className="grid xl:grid-cols-2 xl:divide-x">
        <OneToManyRelationField
          title="实际投入"
          items={calculatedInputs}
          getKey={(line) => line.materialId}
          emptyText="请添加本次实际消耗的物料"
          selector={<MaterialRelationSearch materials={materials} disabledIds={Object.keys(inputs)} onAdd={(materialId) => setInputs((current) => ({ ...current, [materialId]: { locationId: defaultLocationId, lossMode: 'PERCENT', lossValue: 0 } }))} placeholder="添加投入物料" />}
          renderIdentity={({ materialId, material, relations, draft, calculated, unit }) => <div>
            <MaterialRelationIdentity material={material} fallbackId={materialId} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${relations.length ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{relations.length ? 'BOM 预设' : '临时添加'}</span>} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SearchableSelect value={draft.locationId} onChange={(locationId) => setInputs((current) => ({ ...current, [materialId]: { ...current[materialId], locationId } }))} options={locationOptions} placeholder="来源库位" />
              <input aria-label={`实际投入 ${material?.name || materialId}`} type="number" min="0.000001" step="0.000001" value={draft.actualQty ?? (calculated.plannedQty > 0 ? calculated.plannedQty : '')} onChange={(event) => { const value = event.target.value; setInputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: value === '' ? undefined : Number(value) } })) }} className={appInputClassName} placeholder={calculated.plannedQty > 0 ? `计划 ${numberText(calculated.plannedQty)} ${unit}` : `实际数量 ${unit}`} />
            </div>
            <InventoryReference material={material} locationId={draft.locationId} requestedQty={calculated.actualQty} direction="INPUT" />
            <div className="mt-2 text-xs text-gray-500">{relations.length ? `BOM 初值 ${numberText(calculated.plannedQty)} ${unit}；当前输入框即本次实际耗用，清空后恢复 BOM 初值` : '无 BOM 初值，当前输入框即本次实际耗用'}</div>
          </div>}
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
            const plannedQty = plannedOutputQuantity(materialId)
            const displayedQty = draft.isPrimary && selectedBom
              ? (plannedQty > 0 ? plannedQty : '')
              : (draft.actualQty ?? (plannedQty > 0 ? plannedQty : ''))
            return <div>
              <MaterialRelationIdentity material={material} fallbackId={materialId} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${draft.isPrimary ? 'bg-emerald-50 text-emerald-700' : preset ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{draft.isPrimary ? '主产出' : preset ? 'BOM 预设' : '临时添加'}</span>} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SearchableSelect value={draft.locationId} onChange={(locationId) => setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], locationId } }))} options={locationOptions} placeholder="入库库位" />
                <input
                  aria-label={`实际产出 ${material?.name || materialId}`}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={displayedQty}
                  onChange={(event) => {
                    const value = event.target.value
                    if (draft.isPrimary && selectedBom) {
                      setPlannedOutputQty(value === '' ? 0 : Number(value))
                      setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: undefined } }))
                      return
                    }
                    setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: value === '' ? undefined : Number(value) } }))
                  }}
                  className={appInputClassName}
                  placeholder={`实际数量 ${unit}`}
                />
              </div>
              <InventoryReference material={material} locationId={draft.locationId} direction="OUTPUT" />
              {!draft.isPrimary && !selectedBom && <button type="button" onClick={() => setOutputs((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, { ...item, isPrimary: id === materialId }]))) } className="mt-2 text-xs font-medium text-blue-600">设为主产出</button>}
              <div className="mt-2 text-xs text-gray-500">{preset
                ? draft.isPrimary
                  ? `BOM 基准 ${numberText(primaryBasis)} ${unit}；直接修改当前主产出数量会同比例重算尚未手工修正的投入和其它产出`
                  : `BOM 初值 ${numberText(plannedQty)} ${unit}；当前输入框即本次实际产出，清空后恢复比例初值`
                : '无 BOM 初值，当前输入框即本次实际产出'}</div>
            </div>
          }}
          onRemove={(materialId) => outputs[materialId].isPrimary ? onMessage('请先将另一项设为主产出，再移除当前主产出') : setOutputs((current) => { const next = { ...current }; delete next[materialId]; return next })}
        />
      </div>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div><h3 className="font-semibold text-gray-900">生产日报流水</h3><p className="mt-1 text-xs text-gray-500">已确认日报保留为不可覆盖的业务事实；冲销会追加反向库存流水，不删除原记录，也不改回草稿。</p></div><div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">{reports.map((report) => {
      const reportOutputs = report.outputs?.length ? report.outputs : [{ id: report.id, materialCode: report.finishedMaterial.code, materialName: report.finishedMaterial.name, actualQty: report.outputQty, unit: report.finishedMaterial.stockUnit || report.finishedMaterial.unit, isPrimary: true, location: report.outputLocation || { code: '', name: '' } }]
      const status = reportStatusMeta[report.status] || reportStatusMeta.DRAFT
      return <article key={report.id} className={`rounded-lg border px-3 py-3 text-sm ${report.status === 'REVERSED' ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-gray-900">{report.reportNo}</span><span className={`rounded px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span><span className="text-gray-600">{report.bomName || '临时生产'} {report.bomVersion || ''}</span></div>
            <div className="mt-1 text-xs text-gray-500">生产日期 {new Date(report.reportDate).toLocaleDateString('zh-CN')} · 确认 {report.confirmedBy || '—'} / {dateTimeText(report.confirmedAt)}</div>
          </div>
          {report.status === 'CONFIRMED' && canReverse && <AppButton variant="danger" size="sm" onClick={() => { setReverseReason(''); setReversing(report) }}>冲销日报</AppButton>}
        </div>
        <div className="mt-2 text-emerald-700">产出 {reportOutputs.map((item) => `${item.materialCode} · ${numberText(item.actualQty)} ${item.unit}`).join('；')}</div>
        <div className="mt-1 text-xs leading-5 text-gray-600">投入 {report.consumptions.map((item) => `${item.materialCode} · ${numberText(item.actualQty)} ${item.unit}`).join('；') || '无'}{report.qualityInspection ? `；质检 ${report.qualityInspection.inspectionNo} · ${report.qualityInspection.status}` : '；直接可用'}</div>
        {report.note && <div className="mt-1 text-xs text-gray-500">备注：{report.note}</div>}
        {report.status === 'REVERSED' && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">冲销：{report.reversedBy || '—'} / {dateTimeText(report.reversedAt)}；原因：{report.reverseReason || '—'}</div>}
      </article>
    })}{reports.length === 0 && <div className="py-5 text-center text-sm text-gray-500">暂无生产日报流水</div>}</div></section>

    {reversing && <ModalDialog
      title="冲销生产日报"
      description={`${reversing.reportNo} · ${reversing.bomName || '临时生产'} ${reversing.bomVersion || ''}`}
      onClose={() => !reversingReport && setReversing(null)}
      closeDisabled={reversingReport}
      size="sm"
      fullscreenable={false}
      footer={<ModalActions onCancel={() => setReversing(null)} onConfirm={reverseReport} confirmLabel="确认冲销" confirmVariant="danger" disabled={!reverseReason.trim()} busy={reversingReport} />}
    >
      <p className="text-sm leading-6 text-gray-600">系统将追加与原日报相反的投入、产出库存流水。原日报仍保留并标记为“已冲销”；若产出已经被领用、发货或完成质量处置，系统会拒绝冲销。</p>
      <label className="mt-4 block text-sm font-medium text-gray-700">冲销原因
        <textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} maxLength={500} className={`${appTextareaClassName} mt-2`} placeholder="必填，例如：日报数量录入错误，需冲销后重新登记" />
      </label>
    </ModalDialog>}
  </div>
}
