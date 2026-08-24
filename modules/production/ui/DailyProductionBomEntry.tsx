'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import SearchableSelect from '@/app/components/SearchableSelect'
import { calculateProductionConsumption } from '@/lib/production-consumption'
import { loadInventoryLocations, type InventoryLocationOption } from '@/modules/inventory'
import {
  loadDailyProductionShortcutWorkspace,
  submitDailyProductionShortcut,
  type DailyProductionMaterialOption,
  type DailyProductionReportSummary,
} from '../client/daily-production-shortcut-api'
import {
  dailyProductionBomCandidates,
  dailyProductionInputMaterials,
} from '../model/daily-production-bom-selection'

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default function DailyProductionBomEntry({ canUpdate, onMessage }: { canUpdate: boolean; onMessage: (message: string) => void }) {
  const [materials, setMaterials] = useState<DailyProductionMaterialOption[]>([])
  const [reports, setReports] = useState<DailyProductionReportSummary[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [reportDate, setReportDate] = useState(todayInShanghai)
  const [inputMaterialId, setInputMaterialId] = useState('')
  const [bomId, setBomId] = useState('')
  const [outputQty, setOutputQty] = useState(0)
  const [consumptionLocationId, setConsumptionLocationId] = useState('')
  const [outputLocationId, setOutputLocationId] = useState('')
  const [outputDisposition, setOutputDisposition] = useState<'DIRECT_AVAILABLE' | 'QUALITY_INSPECTION'>('DIRECT_AVAILABLE')
  const [note, setNote] = useState('')
  const [actualInputByMaterial, setActualInputByMaterial] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [workspace, locationOptions] = await Promise.all([
        loadDailyProductionShortcutWorkspace(),
        loadInventoryLocations(),
      ])
      setMaterials(workspace.materials.filter((material) => material.boms?.length > 0))
      setReports(workspace.reports)
      setLocations(locationOptions)
      const defaultLocation = locationOptions.find((item) => item.isDefault)?.id || locationOptions[0]?.id || ''
      setConsumptionLocationId((current) => current || defaultLocation)
      setOutputLocationId((current) => current || defaultLocation)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '读取生产日报失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inputMaterials = useMemo(() => dailyProductionInputMaterials(materials), [materials])
  const bomCandidates = useMemo(
    () => dailyProductionBomCandidates(materials, inputMaterialId),
    [inputMaterialId, materials],
  )
  const selectedCandidate = bomCandidates.find((candidate) => candidate.bom.id === bomId)
  const selectedMaterial = selectedCandidate?.outputMaterial
  const selectedBom = selectedCandidate?.bom
  const inputPreview = useMemo(() => (selectedBom?.items || []).flatMap((item) => {
    if (!item.material) return []
    const quantityPerUnit = Number(item.quantity) / Number(selectedBom?.outputQuantity || 1)
    const calculated = outputQty > 0 && quantityPerUnit > 0
      ? calculateProductionConsumption({
          outputQty,
          unitConsumption: quantityPerUnit,
          lossMode: 'PERCENT',
          lossValue: 0,
          actualQty: actualInputByMaterial[item.material.id],
        })
      : { baseQty: 0, lossQty: 0, plannedQty: 0, actualQty: Number(actualInputByMaterial[item.material.id] || 0) }
    return [{ ...item, quantityPerUnit, ...calculated }]
  }), [actualInputByMaterial, outputQty, selectedBom])

  function selectInputMaterial(nextInputMaterialId: string) {
    const candidates = dailyProductionBomCandidates(materials, nextInputMaterialId)
    setInputMaterialId(nextInputMaterialId)
    setBomId(candidates.length === 1 ? candidates[0].bom.id : '')
    setActualInputByMaterial({})
  }

  async function submit() {
    if (!canUpdate) return onMessage('当前账号没有库存过账权限')
    if (!selectedMaterial || !selectedBom) return onMessage('请先选择投入物料，再选择正式 BOM')
    if (outputQty <= 0) return onMessage('主产出数量必须大于 0')
    if (!consumptionLocationId || !outputLocationId) return onMessage('请选择投入来源库位和产出入库库位')
    if (inputPreview.length === 0 || inputPreview.some((line) => line.actualQty <= 0)) return onMessage('正式 BOM 缺少可计算的投入明细')
    setSaving(true)
    try {
      const result = await submitDailyProductionShortcut({
        reportDate,
        finishedMaterialId: selectedMaterial.id,
        bomId: selectedBom.id,
        consumptionLocationId,
        outputLocationId,
        outputQty,
        outputDisposition,
        note: note.trim() || undefined,
        consumptions: inputPreview.flatMap((line) => line.material ? [{
          materialId: line.material.id,
          locationId: consumptionLocationId,
          lossMode: 'PERCENT' as const,
          lossValue: 0,
          actualQty: line.actualQty,
        }] : []),
      })
      onMessage(result.message)
      if (!result.ok) return
      setOutputQty(0)
      setNote('')
      setActualInputByMaterial({})
      await loadData()
    } catch {
      onMessage('生产日报过账失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading && materials.length === 0) return <AppLoadingIndicator label="正在读取正式 BOM 与生产日报..." />

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
        <h2 className="text-base font-semibold">BOM 快捷生产过账</h2>
        <p className="mt-1 leading-6">先按任一实际投入物料反查已发布 BOM，再由所选 BOM 确定主产出并展开完整投入；产出可直接进入可用库存，也可先进入待检并生成后续质量任务。该快捷流程绕过生产订单、派工和报工。</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">生产日期
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" />
          </label>
          <div><label className="mb-2 block text-sm font-medium text-gray-700">投入物料</label><SearchableSelect value={inputMaterialId} onChange={selectInputMaterial} options={inputMaterials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}${item.spec ? ` · ${item.spec}` : ''}`, keywords: item.spec || '' }))} placeholder="输入实际投入的物料编码、名称或规格" emptyText="没有投入该物料的正式 BOM" allowClear /></div>
          <div><label className="mb-2 block text-sm font-medium text-gray-700">正式 BOM／主产出</label><SearchableSelect value={bomId} onChange={(value) => { setBomId(value); setActualInputByMaterial({}) }} options={bomCandidates.map(({ bom, outputMaterial }) => ({ value: bom.id, label: `${outputMaterial.code} · ${outputMaterial.name} ← ${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''}`, keywords: `${outputMaterial.name} ${outputMaterial.spec || ''} ${bom.name} ${bom.version}` }))} placeholder={inputMaterialId ? '选择包含该投入物料的已发布 BOM' : '请先选择投入物料'} emptyText="没有包含该投入物料的正式 BOM" disabled={!inputMaterialId} /></div>
          <label className="text-sm font-medium text-gray-700">主产出实际数量
            <span className="mt-2 flex overflow-hidden rounded-lg border border-gray-200"><input type="number" min={0} step="any" value={outputQty || ''} onChange={(event) => setOutputQty(Math.max(0, Number(event.target.value)))} className="min-w-0 flex-1 px-3 py-2" /><span className="flex items-center bg-gray-50 px-3 text-xs text-gray-600">{selectedMaterial?.stockUnit || selectedMaterial?.unit || '单位'}</span></span>
          </label>
          <div><label className="mb-2 block text-sm font-medium text-gray-700">投入来源库位</label><SearchableSelect value={consumptionLocationId} onChange={setConsumptionLocationId} options={locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} placeholder="选择原料库位" /></div>
          <div><label className="mb-2 block text-sm font-medium text-gray-700">产出入库库位</label><SearchableSelect value={outputLocationId} onChange={setOutputLocationId} options={locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} placeholder="选择成品库位" /></div>
          <label className="text-sm font-medium text-gray-700">产出处置
            <select value={outputDisposition} onChange={(event) => setOutputDisposition(event.target.value as typeof outputDisposition)} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2">
              <option value="DIRECT_AVAILABLE">直接进入可用库存</option>
              <option value="QUALITY_INSPECTION">进入待检并生成质量任务</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-gray-700">备注（可选）<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="例如：夜班汇总、补录原因" /></label>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"><div><h3 className="font-semibold text-gray-900">BOM 投入／产出预览</h3><p className="mt-0.5 text-xs text-gray-500">实际投入可按当天实耗修正；产出以主产出实际数量为准</p></div><AppButton variant="primary" onClick={() => void submit()} disabled={saving || !selectedBom || outputQty <= 0 || !canUpdate}>{saving ? '正在原子过账...' : '确认投入并产出'}</AppButton></div>
        <div className="border-b border-gray-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span className="font-medium">产出：</span>{selectedMaterial ? `${selectedMaterial.code} · ${selectedMaterial.name} · ${numberText(outputQty)} ${selectedMaterial.stockUnit || selectedMaterial.unit}` : '请选择投入物料和正式 BOM'}</div>
        {inputPreview.length === 0 ? <div className="px-4 py-10 text-center text-sm text-gray-500">选择正式 BOM 并填写产出数量后，系统自动展开投入。</div> : <div className="divide-y divide-gray-100">{inputPreview.map((line) => line.material && <div key={line.id} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem] md:items-center"><div><div className="font-medium text-gray-900">{line.material.code} · {line.material.name}</div><div className="mt-1 text-xs text-gray-500">BOM 比例 {numberText(line.quantityPerUnit)} {line.material.stockUnit || line.material.unit} / {selectedMaterial?.stockUnit || selectedMaterial?.unit}</div></div><div className="text-sm text-gray-600">理论投入 <span className="font-medium text-gray-900">{numberText(line.plannedQty)}</span> {line.material.stockUnit || line.material.unit}</div><label className="text-xs text-gray-600">实际投入<input type="number" min={0} step="any" value={actualInputByMaterial[line.material.id] ?? ''} placeholder={numberText(line.plannedQty)} onChange={(event) => setActualInputByMaterial((current) => ({ ...current, [line.material!.id]: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label></div>)}</div>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900">最近生产日报</h3>
        <div className="mt-3 space-y-2">
          {reports.slice(0, 8).map((report) => (
            <div key={report.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="font-medium text-gray-900">{report.reportNo}</span><span className="ml-2 text-gray-600">{report.bomName} {report.bomVersion}</span></div>
                <div className="font-medium text-emerald-700">产出 {report.finishedMaterial.code} · {numberText(report.outputQty)} {report.finishedMaterial.stockUnit || report.finishedMaterial.unit}</div>
              </div>
              <div className="mt-1 text-xs leading-5 text-gray-600">
                投入 {report.consumptions.length > 0
                  ? report.consumptions.map((item) => `${item.materialCode} · ${numberText(item.actualQty)} ${item.unit}`).join('；')
                  : '无投入记录'}
                {report.outputLocation ? `；入库 ${report.outputLocation.code} · ${report.outputLocation.name}` : ''}
                {report.qualityInspection ? `；质检 ${report.qualityInspection.inspectionNo} · ${report.qualityInspection.status}` : '；直接可用'}
              </div>
            </div>
          ))}
          {reports.length === 0 && <div className="py-5 text-center text-sm text-gray-500">暂无生产日报</div>}
        </div>
      </section>
    </div>
  )
}
