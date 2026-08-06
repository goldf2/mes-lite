'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import { appTextareaClassName } from './FormField'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import EmployeeMultiSelect, { EmployeeChoice } from './EmployeeMultiSelect'
import { calculateProductionConsumption, ProductionLossMode } from '@/lib/production-consumption'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import MetricCard from './MetricCard'
import NumberInputField from './NumberInputField'
import AppLoadingIndicator from './AppLoadingIndicator'

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
  primaryImage?: { id: string; url: string; thumbnailUrl?: string; displayUrl?: string; originalUrl?: string; note?: string | null } | null
  bom?: BomOption | null
  boms?: BomOption[]
}

interface BomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  items: BomItem[]
}

interface ConsumptionLine {
  id: string
  materialId: string
  materialCode: string
  materialName: string
  locationId?: string | null
  location?: { id: string; code: string; name: string } | null
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
  outputQty: number
  workers: string
  employees: Array<{
    employeeId?: string | null
    employeeCode: string
    employeeName: string
    employee?: (EmployeeChoice & { isActive: boolean }) | null
  }>
  note?: string | null
  status: 'DRAFT' | 'CONFIRMED' | 'REVERSED'
  bomId?: string | null
  bomName?: string | null
  bomVersion?: string | null
  bomType?: string | null
  bomOutputQuantity?: number | null
  bomOutputUnit?: string | null
  outputCostAmount: number
  confirmedAt?: string | null
  confirmedBy?: string | null
  reversedAt?: string | null
  reversedBy?: string | null
  reverseReason?: string | null
  consumptionLocationId?: string | null
  outputLocationId?: string | null
  consumptionLocation?: { id: string; code: string; name: string } | null
  outputLocation?: { id: string; code: string; name: string } | null
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
  bomId: string
  consumptionLocationId: string
  outputLocationId: string
  outputQty: number
  employeeIds: string[]
  note: string
}

interface ConsumptionDraft {
  locationId: string
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
  bomId: '',
  consumptionLocationId: '',
  outputLocationId: '',
  outputQty: 0,
  employeeIds: [],
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
  const [employees, setEmployees] = useState<EmployeeChoice[]>([])
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string; isDefault: boolean }>>([])
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
  const reportSort = useClientTableSort(reports, {
    reportDate: (report) => new Date(report.reportDate),
    material: (report) => `${report.finishedMaterial.code} ${report.finishedMaterial.name}`,
    location: (report) => report.outputLocation ? `${report.outputLocation.code} ${report.outputLocation.name}` : null,
    outputQty: (report) => report.outputQty,
    workers: (report) => report.workers,
    status: (report) => statusMeta[report.status].label,
  }, 'reportDate', 'desc')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (status !== 'ALL') params.set('status', status)
      const res = await fetch(`/api/daily-production-reports?${params}`)
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取生产记录失败')
        return
      }
      setReports(data.data || [])
      setMaterials(data.materials || [])
      setEmployees(data.employees || [])
    } catch {
      onMessage('获取生产记录失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, status])

  useEffect(() => {
    const timer = window.setTimeout(loadData, 180)
    return () => window.clearTimeout(timer)
  }, [loadData])

  useEffect(() => {
    fetch('/api/inventory-locations')
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setLocations(data.data || []))
      .catch(() => undefined)
  }, [])

  const selectedMaterial = materials.find((material) => material.id === form.finishedMaterialId)
  const selectedBom = form.bomId
    ? selectedMaterial?.boms?.find((bom) => bom.id === form.bomId) || null
    : selectedMaterial?.bom || null
  const totalProcessedQty = Number(form.outputQty || 0)
  const previewConsumptions = useMemo(() => (selectedBom?.items || [])
    .filter((item) => item.material)
    .map((item) => {
      const draft = item.material ? consumptionDraftByMaterial[item.material.id] : undefined
      const lossMode = draft?.lossMode || 'PERCENT'
      const lossValue = Number(draft?.lossValue || 0)
      const quantityPerUnit = Number(item.quantity || 0) / Number(selectedBom?.outputQuantity || 1)
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
        locationId: draft?.locationId || form.consumptionLocationId,
        quantityPerUnit,
        lossMode,
        lossValue,
        ...calculated,
        actualOverridden: draft?.actualQty !== null && draft?.actualQty !== undefined,
      }
    }), [consumptionDraftByMaterial, form.consumptionLocationId, selectedBom, totalProcessedQty])

  const summary = useMemo(() => reports.reduce((result, report) => {
    result[report.status.toLowerCase() as 'draft' | 'confirmed' | 'reversed'] += 1
    if (report.status === 'CONFIRMED' && report.outputLocation?.id) result.locationIds.add(report.outputLocation.id)
    return result
  }, { confirmed: 0, draft: 0, reversed: 0, locationIds: new Set<string>() }), [reports])

  const openCreate = () => {
    setEditingReport(null)
    const defaultLocationId = locations.find((location) => location.isDefault)?.id || locations[0]?.id || ''
    setForm({ ...emptyForm(), consumptionLocationId: defaultLocationId, outputLocationId: defaultLocationId })
    setConsumptionDraftByMaterial({})
    setFormOpen(true)
  }

  const openEdit = (report: DailyProductionReport) => {
    setEditingReport(report)
    setForm({
      reportDate: report.reportDate.slice(0, 10),
      finishedMaterialId: report.finishedMaterial.id,
      bomId: report.bomId || materials.find((material) => material.id === report.finishedMaterial.id)?.bom?.id || '',
      consumptionLocationId: report.consumptionLocationId || locations.find((location) => location.isDefault)?.id || '',
      outputLocationId: report.outputLocationId || locations.find((location) => location.isDefault)?.id || '',
      outputQty: Number(report.outputQty),
      employeeIds: report.employees.flatMap((item) => item.employee?.isActive ? [item.employee.id] : []),
      note: report.note || '',
    })
    setConsumptionDraftByMaterial(Object.fromEntries(report.consumptions.map((line) => [line.materialId, {
      locationId: line.locationId || report.consumptionLocationId || '',
      lossMode: line.lossMode === 'FIXED_PER_UNIT' ? 'FIXED_PER_UNIT' : 'PERCENT',
      lossValue: line.lossMode === 'MANUAL' ? 0 : Number(line.lossValue || line.wastageRate || 0),
      actualQty: Number(line.actualQty),
    }])))
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!form.finishedMaterialId) return onMessage('请选择产出物料')
    if (!form.consumptionLocationId || !form.outputLocationId) return onMessage('请选择原料出库库位和产出入库库位')
    if (form.employeeIds.length === 0) return onMessage('请选择生产员工')
    if (totalProcessedQty <= 0) return onMessage('产出数量必须大于 0')
    if (!form.bomId) return onMessage('请选择生产方案（BOM）')
    if (!selectedBom?.isActive || previewConsumptions.length === 0) {
      return onMessage('该物料尚未建立有效 BOM，请先在 BOM 设置中添加投入物料')
    }
    if (previewConsumptions.some((item) => !item.locationId)) return onMessage('请选择每项投入物料的来源库位')
    if (previewConsumptions.some((item) => item.quantityPerUnit <= 0)) {
      return onMessage('BOM 中存在未填写每批投入数量的原料，请先完善 BOM')
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
          bomId: selectedBom.id,
          outputQty: Number(form.outputQty || 0),
          consumptions: previewConsumptions.flatMap((item) => item.material ? [{
            materialId: item.material.id,
            locationId: item.locationId,
            lossMode: item.lossMode,
            lossValue: item.lossValue,
            actualQty: item.actualOverridden ? item.actualQty : undefined,
          }] : []),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存生产记录失败')
        return
      }
      onMessage(data.message || '生产记录已保存')
      setFormOpen(false)
      await loadData()
    } catch {
      onMessage('保存生产记录失败')
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
        onMessage(data.error || '确认生产记录失败')
        return
      }
      onMessage(data.message || '生产记录已确认')
      setConfirmingReport(null)
      await loadData()
    } catch {
      onMessage('确认生产记录失败')
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
        onMessage(data.error || '冲销生产记录失败')
        return
      }
      onMessage(data.message || '生产记录已冲销')
      setReversingReport(null)
      setReverseReason('')
      await loadData()
    } catch {
      onMessage('冲销生产记录失败')
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
            <span className="ml-2 text-gray-400">来源 {line.location?.code || report.consumptionLocation?.code || '默认库位'}</span>
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
              placeholder="搜索记录号、物料、人员或备注"
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
              <AppButton variant="create" onClick={openCreate}>
                新建生产记录
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">生产记录</h2>
          <p className="mt-1 text-sm text-gray-500">按 BOM 每批投入和主产出批量折算原料耗用；产出状态由入库库位表达，不再固定区分合格、不良和报废</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="已确认记录" value={summary.confirmed} compact />
          <MetricCard label="草稿记录" value={summary.draft} compact />
          <MetricCard label="已冲销记录" value={summary.reversed} tone="danger" compact />
          <MetricCard label="产出使用库位" value={summary.locationIds.size} tone="primary" compact />
        </div>
      </section>

      {loading ? (
        <AppLoadingIndicator label="正在加载生产记录..." className="rounded-lg bg-white shadow-sm" />
      ) : reports.length === 0 ? (
        <div className="rounded-lg bg-white py-16 text-center text-sm text-gray-500 shadow-sm">暂无生产记录</div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {reportSort.sortedRows.map((report) => {
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
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <QuantityCell label="产出入库" value={report.outputQty} tone="text-emerald-700" />
                  <div className="rounded bg-gray-50 px-3 py-2">
                    <div className="text-xs text-gray-500">产出库位</div>
                    <div className="mt-1 font-semibold text-blue-700">{report.outputLocation?.code || '默认库位'}</div>
                  </div>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                    <span>生产方案 {report.bomName || '默认方案'} · {report.bomVersion || '-'}</span>
                    <span>{report.consumptions.length} 项投入</span>
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
                <SortableTableHeader column="reportDate" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort}>生产日期 / 记录号</SortableTableHeader>
                <SortableTableHeader column="material" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort}>产出物料</SortableTableHeader>
                <SortableTableHeader column="location" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort}>产出库位</SortableTableHeader>
                <SortableTableHeader column="outputQty" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort} className="text-right">产出数量</SortableTableHeader>
                <SortableTableHeader column="workers" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort}>人员</SortableTableHeader>
                <SortableTableHeader column="status" activeColumn={reportSort.sortColumn} direction={reportSort.sortDirection} onSort={reportSort.toggleSort}>状态</SortableTableHeader>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportSort.sortedRows.map((report) => {
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
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{report.outputLocation?.name || '默认库位'}</div>
                      <div className="font-mono text-xs text-gray-500">{report.outputLocation?.code || 'DEFAULT'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{numberText(report.outputQty)} {report.finishedMaterial.stockUnit || report.finishedMaterial.unit}</td>
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
        <ModalDialog
          title={editingReport ? '编辑生产记录' : '新建生产记录'}
          description="生产记录必须选择 BOM；产出状态由实际入库库位表达"
          onClose={() => setFormOpen(false)}
          closeDisabled={saving}
          size="xl"
          footer={(
            <ModalActions
              onCancel={() => setFormOpen(false)}
              onConfirm={submitForm}
              confirmLabel="保存草稿"
              busy={saving}
            />
          )}
        >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-700">
                  生产日期
                  <input type="date" value={form.reportDate} onChange={(event) => setForm({ ...form, reportDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
                </label>
                <label className="text-sm text-gray-700">
                  生产员工
                  <div className="mt-1"><EmployeeMultiSelect value={form.employeeIds} options={employees} onChange={(employeeIds) => setForm({ ...form, employeeIds })} /></div>
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
                      const material = materials.find((item) => item.id === finishedMaterialId)
                      setForm({ ...form, finishedMaterialId, bomId: material?.bom?.id || '' })
                      setConsumptionDraftByMaterial({})
                    }}
                    placeholder="输入成品编码、名称或规格筛选"
                  />
                </div>
                <label className="text-sm text-gray-700 md:col-span-2">
                  生产方案（BOM）
                  <SearchableSelect
                    value={form.bomId}
                    onChange={(bomId) => {
                      setForm({ ...form, bomId })
                      setConsumptionDraftByMaterial({})
                    }}
                    options={(selectedMaterial?.boms || []).map((bom) => ({
                      value: bom.id,
                      label: `${bom.name} · ${bom.version}${bom.isDefault ? ' · 默认' : ''} · ${numberText(bom.outputQuantity)} ${bom.outputUnit}/批`,
                      keywords: 'BOM 生产转换',
                    }))}
                    placeholder={selectedMaterial ? '输入 BOM 名称或版本筛选' : '请先选择产出物料'}
                    disabled={!selectedMaterial}
                    className="mt-1"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  默认投入来源库位
                  <SearchableSelect
                    value={form.consumptionLocationId}
                    onChange={(consumptionLocationId) => setForm({ ...form, consumptionLocationId })}
                    options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
                    placeholder="输入库位编码或名称筛选"
                    className="mt-1"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  产出入库库位
                  <SearchableSelect
                    value={form.outputLocationId}
                    onChange={(outputLocationId) => setForm({ ...form, outputLocationId })}
                    options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
                    placeholder="输入库位编码或名称筛选"
                    className="mt-1"
                  />
                </label>
              </div>

              {selectedBom && selectedMaterial && (
                <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <div className="mb-2 text-xs font-medium text-blue-800">生产方案投入与产出核对</div>
                  <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                    <div className="space-y-2">
                      {selectedBom.items.filter((item) => item.material).map((item) => {
                        const inputMaterial = materials.find((material) => material.id === item.material?.id)
                        return item.material && (
                          <MaterialPreviewCard
                            key={item.id}
                            label="投入物料"
                            material={inputMaterial || item.material}
                            detail={`${numberText(item.quantity)} ${item.unit} / ${numberText(selectedBom.outputQuantity)} ${selectedBom.outputUnit}`}
                          />
                        )
                      })}
                      {selectedBom.items.every((item) => !item.material) && (
                        <div className="rounded-lg border border-blue-100 bg-white px-3 py-5 text-sm text-gray-500">未配置投入物料</div>
                      )}
                    </div>
                    <div className="text-center text-xs font-medium text-blue-700">
                      <div>{selectedBom.name}</div>
                      <div className="mt-1 text-lg">→</div>
                    </div>
                    <div>
                      <MaterialPreviewCard
                        label="产出物料"
                        material={selectedMaterial}
                        detail={`${numberText(selectedBom.outputQuantity)} ${selectedBom.outputUnit} / 批`}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberInputField label="产出入库数量" value={form.outputQty} onChange={(outputQty) => setForm({ ...form, outputQty })} />
                <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  产出状态由所选库位决定；可在“配置 / 库位配置”中新增相应业务库位。
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">投入明细</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      本次产出 {numberText(totalProcessedQty)}；基准耗用由 BOM 每批投入折算，可再记录本批次额外耗用
                    </div>
                  </div>
                  {selectedBom && <span className="text-xs text-gray-500">{selectedBom.name} · {selectedBom.version}</span>}
                </div>
                <div className="p-3">
                  {!selectedMaterial ? (
                    <div className="py-6 text-center text-sm text-gray-500">选择产出物料后计算原料耗用</div>
                  ) : previewConsumptions.length === 0 ? (
                    <div className="rounded bg-amber-50 px-3 py-4 text-sm text-amber-800">该物料没有 BOM 投入明细，暂时不能提交生产记录</div>
                  ) : (
                    <div className="space-y-2">
                      {previewConsumptions.map((item) => item.material && (
                        <div key={item.id} className="rounded border border-gray-100 px-3 py-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-900">{materialNameSpec(item.material)}</span>
                            <span className="ml-2 font-mono text-xs text-gray-400">{item.material.code}</span>
                            <div className={`mt-0.5 text-xs ${item.quantityPerUnit > 0 ? 'text-gray-500' : 'text-red-600'}`}>
                              {item.quantityPerUnit > 0
                                ? `批次折算 ${numberText(item.quantityPerUnit)} ${item.material.stockUnit || item.material.unit}原料/${selectedMaterial.stockUnit || selectedMaterial.unit}主产出`
                                : '尚未填写 BOM 每批投入数量'}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="text-xs text-gray-600">
                              投入来源库位
                              <SearchableSelect
                                value={item.locationId}
                                onChange={(locationId) => setConsumptionDraftByMaterial((current) => ({
                                  ...current,
                                  [item.material!.id]: {
                                    locationId,
                                    lossMode: current[item.material!.id]?.lossMode || 'PERCENT',
                                    lossValue: current[item.material!.id]?.lossValue || 0,
                                    actualQty: current[item.material!.id]?.actualQty ?? null,
                                  },
                                }))}
                                options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))}
                                placeholder="输入库位筛选"
                                className="mt-1"
                              />
                            </label>
                                <label className="text-xs text-gray-600">
                                  损耗方式
                                  <select
                                    value={item.lossMode}
                                    onChange={(event) => setConsumptionDraftByMaterial((current) => ({
                                      ...current,
                                      [item.material!.id]: {
                                        locationId: current[item.material!.id]?.locationId || '',
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
                                          locationId: current[item.material!.id]?.locationId || '',
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
                                          locationId: current[item.material!.id]?.locationId || '',
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
        </ModalDialog>
      )}

      {confirmingReport && (
        <ModalDialog
          title="确认生产记录"
          onClose={() => setConfirmingReport(null)}
          closeDisabled={saving}
          footer={(
            <ModalActions
              onCancel={() => setConfirmingReport(null)}
              onConfirm={confirmReport}
              confirmLabel="确认并更新库存"
              confirmVariant="create"
              busy={saving}
            />
          )}
        >
            <p className="mt-2 text-sm text-gray-600">确认后将立即扣减原料库存，并把 {numberText(confirmingReport.outputQty)} {confirmingReport.finishedMaterial.stockUnit || confirmingReport.finishedMaterial.unit} 产出增加到所选库位。</p>
            <p className="mt-2 text-xs text-gray-500">各项投入按明细中的来源库位扣减；产出库位：{confirmingReport.outputLocation?.code || '默认库位'}。入库后发货模块可直接读取该库位可用量。</p>
            <div className="mt-4">{consumptionList(confirmingReport)}</div>
        </ModalDialog>
      )}

      {reversingReport && (
        <ModalDialog
          title="冲销生产记录"
          onClose={() => setReversingReport(null)}
          closeDisabled={saving}
          footer={(
            <ModalActions
              onCancel={() => setReversingReport(null)}
              onConfirm={reverseReport}
              confirmLabel="确认冲销"
              confirmVariant="danger"
              disabled={!reverseReason.trim()}
              busy={saving}
            />
          )}
        >
            <p className="mt-2 text-sm text-gray-600">系统将从原产出库位扣回本次入库数量，并恢复当时实际消耗的原料库存。</p>
            <textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} placeholder="填写冲销原因" className={`mt-4 ${appTextareaClassName}`} />
        </ModalDialog>
      )}
      </div>
    </>
  )
}

function MaterialPreviewCard({
  label,
  material,
  detail,
}: {
  label: string
  material: { code: string; name: string; spec?: string | null; primaryImage?: { url: string; thumbnailUrl?: string; note?: string | null } | null }
  detail: string
}) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-lg border border-blue-100 bg-white p-3">
      {material.primaryImage ? (
        <Image
          src={material.primaryImage.thumbnailUrl || material.primaryImage.url}
          alt={material.primaryImage.note || material.name}
          width={64}
          height={64}
          unoptimized
          className="h-16 w-16 shrink-0 rounded-lg border border-gray-100 object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">暂无图片</div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="mt-1 truncate font-mono text-xs text-gray-500">{material.code}</div>
        <div className="truncate text-sm font-medium text-gray-900">{materialNameSpec(material)}</div>
        <div className="mt-1 text-xs text-blue-700">{detail}</div>
      </div>
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
