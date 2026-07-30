'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import ModalOverlay from './ModalOverlay'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import { calculateProductionConsumption, ProductionLossMode } from '@/lib/production-consumption'

interface BomItem {
  id: string
  quantity: number
  unit: string
  wastageRate: number
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    primaryMeasure?: string
    stockUnit: string
    unit: string
  } | null
}

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  stockUnit: string
  unit: string
  customer?: { id: string; code: string; name: string } | null
  bom?: {
    id: string
    version: string
    isActive: boolean
    outputQuantity: number
    outputUnit: string
    items: BomItem[]
  } | null
}

interface ConsumptionLine {
  id: string
  materialId: string
  materialCode: string
  materialName: string
  quantityPerUnit: number
  wastageRate: number
  lossMode: 'MANUAL' | ProductionLossMode
  lossValue: number
  lossQty: number
  plannedQty: number
  actualQty: number
  unit: string
  valuationQty: number
  costAmount: number
  material: {
    id: string
    code: string
    name: string
    stockUnit: string
    unit: string
    stock?: { qty: number; availableQty: number } | null
  }
}

interface DailyProductionReport {
  id: string
  reportNo: string
  reportDate: string
  goodQty: number
  badQty: number
  scrapQty: number
  workers: string
  note?: string | null
  status: 'DRAFT' | 'CONFIRMED' | 'REVERSED'
  bomVersion?: string | null
  outputCostAmount: number
  confirmedAt?: string | null
  confirmedBy?: string | null
  reversedAt?: string | null
  reversedBy?: string | null
  reverseReason?: string | null
  finishedMaterial: {
    id: string
    code: string
    name: string
    category: string
    stockUnit: string
    unit: string
  }
  consumptions: ConsumptionLine[]
}

interface ReportForm {
  reportDate: string
  finishedMaterialId: string
  goodQty: number
  badQty: number
  scrapQty: number
  workers: string
  note: string
}

interface ConsumptionDraft {
  lossMode: ProductionLossMode
  lossValue: number
  actualQty: number | null
}

const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const emptyForm = (): ReportForm => ({
  reportDate: today(),
  finishedMaterialId: '',
  goodQty: 0,
  badQty: 0,
  scrapQty: 0,
  workers: '',
  note: '',
})

const statusMeta = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-emerald-50 text-emerald-700' },
  REVERSED: { label: '已冲销', className: 'bg-red-50 text-red-700' },
} as const

const numberText = (value: number, digits = 3) =>
  Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')

const materialNameSpec = (material: { name: string; spec?: string | null }) =>
  material.spec ? `${material.name} · ${material.spec}` : material.name

export default function StatsPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [reports, setReports] = useState<DailyProductionReport[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.dailyProduction.viewMode', 'card')
  const [formOpen, setFormOpen] = useState(false)
  const [editingReport, setEditingReport] = useState<DailyProductionReport | null>(null)
  const [form, setForm] = useState<ReportForm>(emptyForm)
  const [consumptionDraftByMaterial, setConsumptionDraftByMaterial] = useState<Record<string, ConsumptionDraft>>({})
  const [confirmingReport, setConfirmingReport] = useState<DailyProductionReport | null>(null)
  const [reversingReport, setReversingReport] = useState<DailyProductionReport | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (status !== 'ALL') params.set('status', status)
      const res = await fetch(`/api/daily-production-reports?${params}`)
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取生产日报失败')
        return
      }
      setReports(data.data || [])
      setMaterials(data.materials || [])
    } catch {
      onMessage('获取生产日报失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, status])

  useEffect(() => {
    const timer = window.setTimeout(loadData, 180)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const selectedMaterial = materials.find((material) => material.id === form.finishedMaterialId)
  const totalProcessedQty = Number(form.goodQty || 0) + Number(form.badQty || 0) + Number(form.scrapQty || 0)
  const previewConsumptions = useMemo(() => (selectedMaterial?.bom?.items || [])
    .filter((item) => item.material)
    .map((item) => {
      const draft = item.material ? consumptionDraftByMaterial[item.material.id] : undefined
      const lossMode = draft?.lossMode || 'PERCENT'
      const lossValue = Number(draft?.lossValue || 0)
      const quantityPerUnit = Number(item.quantity || 0) / Number(selectedMaterial?.bom?.outputQuantity || 1)
      const calculated = totalProcessedQty > 0 && quantityPerUnit > 0
        ? calculateProductionConsumption({
            outputQty: totalProcessedQty,
            unitConsumption: quantityPerUnit,
            lossMode,
            lossValue,
            actualQty: draft?.actualQty,
          })
        : { baseQty: 0, lossQty: 0, plannedQty: 0, actualQty: Number(draft?.actualQty || 0) }
      return {
        ...item,
        quantityPerUnit,
        lossMode,
        lossValue,
        ...calculated,
        actualOverridden: draft?.actualQty !== null && draft?.actualQty !== undefined,
      }
    }), [consumptionDraftByMaterial, selectedMaterial, totalProcessedQty])

  const summary = useMemo(() => reports.reduce((result, report) => {
    if (report.status === 'CONFIRMED') {
      result.confirmed += 1
      result.good += Number(report.goodQty)
      result.bad += Number(report.badQty)
      result.scrap += Number(report.scrapQty)
    }
    return result
  }, { confirmed: 0, good: 0, bad: 0, scrap: 0 }), [reports])

  const openCreate = () => {
    setEditingReport(null)
    setForm(emptyForm())
    setConsumptionDraftByMaterial({})
    setFormOpen(true)
  }

  const openEdit = (report: DailyProductionReport) => {
    setEditingReport(report)
    setForm({
      reportDate: report.reportDate.slice(0, 10),
      finishedMaterialId: report.finishedMaterial.id,
      goodQty: Number(report.goodQty),
      badQty: Number(report.badQty),
      scrapQty: Number(report.scrapQty),
      workers: report.workers,
      note: report.note || '',
    })
    setConsumptionDraftByMaterial(Object.fromEntries(report.consumptions.map((line) => [line.materialId, {
      lossMode: line.lossMode === 'FIXED_PER_UNIT' ? 'FIXED_PER_UNIT' : 'PERCENT',
      lossValue: line.lossMode === 'MANUAL' ? 0 : Number(line.lossValue || line.wastageRate || 0),
      actualQty: Number(line.actualQty),
    }])))
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!form.finishedMaterialId) return onMessage('请选择产出物料')
    if (!form.workers.trim()) return onMessage('请填写生产人员')
    if (totalProcessedQty <= 0) return onMessage('合格、不良和报废数量不能全部为 0')
    if (!selectedMaterial?.bom?.isActive || previewConsumptions.length === 0) {
      return onMessage('该物料尚未建立有效 BOM，请先在物料 BOM 关联中添加原料')
    }
    if (previewConsumptions.some((item) => item.quantityPerUnit <= 0)) {
      return onMessage('BOM 中存在未填写换算比例的原料，请先完善 BOM')
    }

    setSaving(true)
    try {
      const res = await fetch(editingReport
        ? `/api/daily-production-reports/${editingReport.id}`
        : '/api/daily-production-reports', {
        method: editingReport ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          goodQty: Number(form.goodQty || 0),
          badQty: Number(form.badQty || 0),
          scrapQty: Number(form.scrapQty || 0),
          consumptions: previewConsumptions.flatMap((item) => item.material ? [{
            materialId: item.material.id,
            lossMode: item.lossMode,
            lossValue: item.lossValue,
            actualQty: item.actualOverridden ? item.actualQty : undefined,
          }] : []),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存生产日报失败')
        return
      }
      onMessage(data.message || '生产日报已保存')
      setFormOpen(false)
      await loadData()
    } catch {
      onMessage('保存生产日报失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmReport = async () => {
    if (!confirmingReport) return
    setSaving(true)
    try {
      const res = await fetch(`/api/daily-production-reports/${confirmingReport.id}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '确认生产日报失败')
        return
      }
      onMessage(data.message || '生产日报已确认')
      setConfirmingReport(null)
      await loadData()
    } catch {
      onMessage('确认生产日报失败')
    } finally {
      setSaving(false)
    }
  }

  const reverseReport = async () => {
    if (!reversingReport) return
    if (!reverseReason.trim()) return onMessage('请填写冲销原因')
    setSaving(true)
    try {
      const res = await fetch(`/api/daily-production-reports/${reversingReport.id}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '冲销生产日报失败')
        return
      }
      onMessage(data.message || '生产日报已冲销')
      setReversingReport(null)
      setReverseReason('')
      await loadData()
    } catch {
      onMessage('冲销生产日报失败')
    } finally {
      setSaving(false)
    }
  }

  const reportActions = (report: DailyProductionReport) => (
    <div className="flex flex-wrap justify-end gap-2">
      {report.status === 'DRAFT' && (
        <>
          <button type="button" onClick={() => openEdit(report)} className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            编辑
          </button>
          <button type="button" onClick={() => setConfirmingReport(report)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            确认并更新库存
          </button>
        </>
      )}
      {report.status === 'CONFIRMED' && (
        <button type="button" onClick={() => {
          setReversingReport(report)
          setReverseReason('')
        }} className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
          冲销
        </button>
      )}
    </div>
  )

  const consumptionList = (report: DailyProductionReport) => (
    <div className="space-y-2">
      {report.consumptions.map((line) => (
        <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <span className="font-medium text-gray-800">{line.materialName}</span>
            <span className="ml-2 font-mono text-gray-400">{line.materialCode}</span>
          </div>
          <div className="flex items-center gap-4 text-gray-600">
            {line.quantityPerUnit > 0 && <span>标准 {numberText(line.quantityPerUnit)} {line.unit}原料/{report.finishedMaterial.stockUnit || report.finishedMaterial.unit}产出</span>}
            {line.lossMode === 'PERCENT' && line.lossValue > 0 && <span>损耗 {numberText(line.lossValue)}%</span>}
            {line.lossMode === 'FIXED_PER_UNIT' && line.lossValue > 0 && <span>每 {report.finishedMaterial.stockUnit || report.finishedMaterial.unit} 损耗 {numberText(line.lossValue)} {line.unit}</span>}
            {line.lossMode === 'MANUAL' && <span>历史手工耗用</span>}
            <span className="font-semibold text-gray-900">实际耗用 {numberText(line.actualQty)} {line.unit}</span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.productionReports"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索日报号、物料、人员或备注"
            />
          )}
          filters={(
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="ALL">全部状态</option>
              <option value="DRAFT">草稿</option>
              <option value="CONFIRMED">已确认</option>
              <option value="REVERSED">已冲销</option>
            </select>
          )}
          actions={(
            <>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              <button type="button" onClick={openCreate} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                新建
              </button>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">生产日报</h2>
          <p className="mt-1 text-sm text-gray-500">按 BOM 换算比例和本次额外损耗计算原料耗用；确认后扣减原料并将合格品入库</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="已确认日报" value={summary.confirmed} />
          <Metric label="合格入库" value={numberText(summary.good)} tone="text-emerald-700" />
          <Metric label="不良品" value={numberText(summary.bad)} tone="text-amber-700" />
          <Metric label="报废品" value={numberText(summary.scrap)} tone="text-red-700" />
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg bg-white py-16 text-center text-sm text-gray-500 shadow-sm">加载中...</div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg bg-white py-16 text-center text-sm text-gray-500 shadow-sm">暂无生产日报</div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {reports.map((report) => {
            const meta = statusMeta[report.status]
            return (
              <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-700">{report.reportNo}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                    </div>
                    <div className="mt-2 font-semibold text-gray-900">{report.finishedMaterial.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-gray-500">{report.finishedMaterial.code}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium text-gray-800">{new Date(report.reportDate).toLocaleDateString('zh-CN')}</div>
                    <div className="mt-1 text-xs text-gray-500">{report.workers}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <QuantityCell label="合格入库" value={report.goodQty} tone="text-emerald-700" />
                  <QuantityCell label="不良" value={report.badQty} tone="text-amber-700" />
                  <QuantityCell label="报废" value={report.scrapQty} tone="text-red-700" />
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                    <span>BOM {report.bomVersion || '-'}</span>
                    <span>{report.consumptions.length} 项原料</span>
                  </div>
                  {consumptionList(report)}
                </div>
                {report.note && <div className="mt-3 text-sm text-gray-500">{report.note}</div>}
                {report.status === 'REVERSED' && report.reverseReason && (
                  <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">冲销原因：{report.reverseReason}</div>
                )}
                <div className="mt-4 border-t border-gray-100 pt-3">{reportActions(report)}</div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-4 py-3">生产日期 / 日报号</th>
                <th className="px-4 py-3">产出物料</th>
                <th className="px-4 py-3 text-right">合格</th>
                <th className="px-4 py-3 text-right">不良</th>
                <th className="px-4 py-3 text-right">报废</th>
                <th className="px-4 py-3">人员</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((report) => {
                const meta = statusMeta[report.status]
                return (
                  <tr key={report.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div>{new Date(report.reportDate).toLocaleDateString('zh-CN')}</div>
                      <div className="mt-1 font-mono text-xs text-blue-700">{report.reportNo}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{report.finishedMaterial.name}</div>
                      <div className="font-mono text-xs text-gray-500">{report.finishedMaterial.code}</div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-blue-700">查看 {report.consumptions.length} 项耗料</summary>
                        <div className="mt-2 w-[520px] max-w-[60vw]">{consumptionList(report)}</div>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{numberText(report.goodQty)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{numberText(report.badQty)}</td>
                    <td className="px-4 py-3 text-right text-red-700">{numberText(report.scrapQty)}</td>
                    <td className="px-4 py-3 text-sm">{report.workers}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${meta.className}`}>{meta.label}</span></td>
                    <td className="px-4 py-3">{reportActions(report)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <ModalOverlay onClose={() => !saving && setFormOpen(false)}>
          <div className="flex max-h-[calc(100vh-32px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="font-semibold text-gray-900">{editingReport ? '编辑生产日报' : '新建生产日报'}</h3>
                <p className="mt-1 text-xs text-gray-500">总加工数量包含合格、不良和报废，三者都会消耗原料</p>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-700">
                  生产日期
                  <input type="date" value={form.reportDate} onChange={(event) => setForm({ ...form, reportDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
                </label>
                <label className="text-sm text-gray-700">
                  生产人员
                  <input value={form.workers} onChange={(event) => setForm({ ...form, workers: event.target.value })} placeholder="多人可用逗号分隔" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
                </label>
                <div className="md:col-span-2">
                  <div className="mb-1 text-sm text-gray-700">产出物料</div>
                  <MaterialChoiceSearch
                    value={form.finishedMaterialId}
                    options={materials.map((material) => ({
                      id: material.id,
                      sku: material.code,
                      name: materialNameSpec(material),
                      category: material.category,
                      unit: material.stockUnit || material.unit,
                      customer: material.customer,
                    }))}
                    onChange={(finishedMaterialId) => {
                      setForm({ ...form, finishedMaterialId })
                      setConsumptionDraftByMaterial({})
                    }}
                    placeholder="输入成品编码、名称或规格筛选"
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberField label="合格入库数量" value={form.goodQty} onChange={(goodQty) => setForm({ ...form, goodQty })} />
                <NumberField label="不良品数量" value={form.badQty} onChange={(badQty) => setForm({ ...form, badQty })} />
                <NumberField label="报废品数量" value={form.scrapQty} onChange={(scrapQty) => setForm({ ...form, scrapQty })} />
              </div>

              <div className="mt-5 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">原料耗用与损耗</div>
                    <div className="mt-0.5 text-xs text-gray-500">总加工 {numberText(totalProcessedQty)}；基准耗用来自 BOM 换算比例，可再记录本批次额外损耗</div>
                  </div>
                  {selectedMaterial?.bom && <span className="text-xs text-gray-500">{selectedMaterial.bom.version}</span>}
                </div>
                <div className="p-3">
                  {!selectedMaterial ? (
                    <div className="py-6 text-center text-sm text-gray-500">选择产出物料后计算原料耗用</div>
                  ) : previewConsumptions.length === 0 ? (
                    <div className="rounded bg-amber-50 px-3 py-4 text-sm text-amber-800">该物料没有 BOM 原料及换算比例，暂时不能提交日报</div>
                  ) : (
                    <div className="space-y-2">
                      {previewConsumptions.map((item) => item.material && (
                        <div key={item.id} className="rounded border border-gray-100 px-3 py-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-900">{materialNameSpec(item.material)}</span>
                            <span className="ml-2 font-mono text-xs text-gray-400">{item.material.code}</span>
                            <div className={`mt-0.5 text-xs ${item.quantityPerUnit > 0 ? 'text-gray-500' : 'text-red-600'}`}>
                              {item.quantityPerUnit > 0
                                ? `换算比例 ${numberText(item.quantityPerUnit)} ${item.material.stockUnit || item.material.unit}原料/${selectedMaterial.stockUnit || selectedMaterial.unit}产出`
                                : '尚未填写 BOM 换算比例'}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)]">
                            <label className="text-xs text-gray-600">
                              损耗方式
                              <select
                                value={item.lossMode}
                                onChange={(event) => setConsumptionDraftByMaterial((current) => ({
                                  ...current,
                                  [item.material!.id]: {
                                    lossMode: event.target.value as ProductionLossMode,
                                    lossValue: 0,
                                    actualQty: null,
                                  },
                                }))}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                              >
                                <option value="PERCENT">百分比损耗</option>
                                <option value="FIXED_PER_UNIT">每产出单位固定损耗</option>
                              </select>
                            </label>
                            <label className="text-xs text-gray-600">
                              {item.lossMode === 'PERCENT' ? '损耗百分比' : `每 ${selectedMaterial.stockUnit || selectedMaterial.unit} 固定损耗`}
                              <span className="mt-1 flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.lossValue || ''}
                                  onChange={(event) => setConsumptionDraftByMaterial((current) => ({
                                    ...current,
                                    [item.material!.id]: {
                                      lossMode: current[item.material!.id]?.lossMode || 'PERCENT',
                                      lossValue: Math.max(0, Number(event.target.value)),
                                      actualQty: null,
                                    },
                                  }))}
                                  className="min-w-0 flex-1 px-3 py-2 text-right text-sm outline-none"
                                />
                                <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">
                                  {item.lossMode === 'PERCENT' ? '%' : `${item.material.stockUnit || item.material.unit}原料/${selectedMaterial.stockUnit || selectedMaterial.unit}产出`}
                                </span>
                              </span>
                            </label>
                            <label className="text-xs text-gray-600">
                              实际耗用（留空按计算值）
                              <span className="mt-1 flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={consumptionDraftByMaterial[item.material.id]?.actualQty ?? ''}
                                  placeholder={numberText(item.plannedQty)}
                                  onChange={(event) => setConsumptionDraftByMaterial((current) => ({
                                    ...current,
                                    [item.material!.id]: {
                                      lossMode: current[item.material!.id]?.lossMode || 'PERCENT',
                                      lossValue: current[item.material!.id]?.lossValue || 0,
                                      actualQty: event.target.value === '' || Number(event.target.value) <= 0
                                        ? null
                                        : Number(event.target.value),
                                    },
                                  }))}
                                  className="min-w-0 flex-1 px-3 py-2 text-right font-semibold outline-none"
                                />
                                <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">{item.material.stockUnit || item.material.unit}</span>
                              </span>
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            <span>基准 {numberText(item.baseQty)} {item.unit}</span>
                            <span>损耗 {numberText(item.lossQty)} {item.unit}</span>
                            <span>计算耗用 {numberText(item.plannedQty)} {item.unit}</span>
                            <span className="font-semibold">实际 {numberText(item.actualQty)} {item.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="mt-5 block text-sm text-gray-700">
                备注
                <textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700">取消</button>
              <button type="button" onClick={submitForm} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? '保存中...' : '保存草稿'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {confirmingReport && (
        <ModalOverlay onClose={() => !saving && setConfirmingReport(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-gray-900">确认生产日报</h3>
            <p className="mt-2 text-sm text-gray-600">确认后将立即扣减原料库存，并增加 {numberText(confirmingReport.goodQty)} {confirmingReport.finishedMaterial.stockUnit || confirmingReport.finishedMaterial.unit} 合格品库存。</p>
            <div className="mt-4">{consumptionList(confirmingReport)}</div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmingReport(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">取消</button>
              <button type="button" onClick={confirmReport} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? '处理中...' : '确认并更新库存'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {reversingReport && (
        <ModalOverlay onClose={() => !saving && setReversingReport(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-gray-900">冲销生产日报</h3>
            <p className="mt-2 text-sm text-gray-600">系统将扣回本次合格品，并恢复当时实际消耗的原料库存。</p>
            <textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} placeholder="填写冲销原因" className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setReversingReport(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">取消</button>
              <button type="button" onClick={reverseReport} disabled={saving} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? '处理中...' : '确认冲销'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      </div>
    </>
  )
}

function Metric({ label, value, tone = 'text-gray-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

function QuantityCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 font-semibold ${tone}`}>{numberText(value)}</div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm text-gray-700">
      {label}
      <input
        type="number"
        min={0}
        step="any"
        value={value || ''}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
      />
    </label>
  )
}
