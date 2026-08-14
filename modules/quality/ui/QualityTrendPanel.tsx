'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { appInputClassName, appSelectClassName } from '@/app/components/FormField'
import { loadQualityInspectionStandards, loadQualityTrends } from '../client/quality-inspection-standard-api'
import type { QualityInspectionMaterialOption, QualityTrendWorkspace } from '../contracts/quality-inspection-standard'

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const emptyTrend: QualityTrendWorkspace = {
  range: { startDate: '', endDate: '', truncated: false },
  summary: { completedInspections: 0, passedInspections: 0, failedInspections: 0, partialInspections: 0, sampleQty: 0, goodQty: 0, badQty: 0, inspectionPassRate: 0, samplePassRate: 0 },
  byDay: [], byMaterial: [], failedItems: [],
}

export default function QualityTrendPanel({ canReadStandards, onMessage }: { canReadStandards: boolean; onMessage: (message: string) => void }) {
  const initialDates = useMemo(() => ({ startDate: dateValue(new Date(Date.now() - 29 * 86_400_000)), endDate: dateValue(new Date()) }), [])
  const [filters, setFilters] = useState({ ...initialDates, materialId: '', sourceType: '' })
  const [trend, setTrend] = useState(emptyTrend)
  const [materials, setMaterials] = useState<QualityInspectionMaterialOption[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTrend(await loadQualityTrends(filters)) }
    catch (error) { onMessage(error instanceof Error ? error.message : '获取质量趋势失败') }
    finally { setLoading(false) }
  }, [filters, onMessage])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!canReadStandards) return
    void loadQualityInspectionStandards('', '').then((workspace) => setMaterials(workspace.materials)).catch(() => setMaterials([]))
  }, [canReadStandards])

  const maxDaily = Math.max(1, ...trend.byDay.map((item) => item.completedInspections))
  return (
    <section>
      <div><h2 className="text-lg font-semibold text-gray-900">质量趋势</h2><p className="mt-1 text-sm text-gray-500">仅统计已完成的真实检验任务，同时展示批次判定和抽检样本两种口径。</p></div>
      <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-slate-50 p-4 md:grid-cols-5">
        <label className="text-xs font-medium text-gray-700">开始日期<input type="date" value={filters.startDate} max={filters.endDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} className={`mt-1 ${appInputClassName}`} /></label>
        <label className="text-xs font-medium text-gray-700">结束日期<input type="date" value={filters.endDate} min={filters.startDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} className={`mt-1 ${appInputClassName}`} /></label>
        <label className="text-xs font-medium text-gray-700">物料<select value={filters.materialId} onChange={(event) => setFilters({ ...filters, materialId: event.target.value })} className={`mt-1 ${appSelectClassName}`}><option value="">全部物料</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="text-xs font-medium text-gray-700">来源<select value={filters.sourceType} onChange={(event) => setFilters({ ...filters, sourceType: event.target.value })} className={`mt-1 ${appSelectClassName}`}><option value="">全部来源</option><option value="PRODUCTION_ORDER_ACTUAL_OUTPUT">生产入库</option><option value="RETURN_ORDER">退货入库</option></select></label>
        <div className="flex items-end"><AppButton fullWidth variant="primary" onClick={() => void load()} disabled={loading}>刷新统计</AppButton></div>
      </div>
      {loading && trend.summary.completedInspections === 0 ? <div className="mt-6"><AppLoadingIndicator label="正在统计质量趋势..." /></div> : <>
        {trend.range.truncated && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前范围超过 5000 条检验记录，结果已截断；请缩小日期或物料范围。</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['完成检验', trend.summary.completedInspections, '批'], ['批次合格率', trend.summary.inspectionPassRate, '%'],
            ['样本合格率', trend.summary.samplePassRate, '%'], ['不合格批次', trend.summary.failedInspections, '批'],
            ['不合格样本', trend.summary.badQty, '件'],
          ].map(([label, value, unit]) => <div key={label} className="rounded-lg border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">{label}</div><div className="mt-2 text-2xl font-semibold text-gray-900">{value}<span className="ml-1 text-xs font-normal text-gray-400">{unit}</span></div></div>)}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-4"><h3 className="font-semibold text-gray-900">日趋势</h3>{trend.byDay.length === 0 ? <div className="py-12 text-center text-sm text-gray-400">当前范围内无已完成检验。</div> : <div className="mt-4 space-y-3">{trend.byDay.map((item) => <div key={item.date} className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-3 text-xs"><span className="text-gray-600">{item.date}</span><div className="h-5 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-blue-500" style={{ width: `${item.completedInspections / maxDaily * 100}%` }} /></div><span className="text-right text-gray-600">{item.completedInspections} 批 · {item.samplePassRate}%</span></div>)}</div>}</section>
          <section className="rounded-lg border border-gray-200 bg-white p-4"><h3 className="font-semibold text-gray-900">不合格项目 TOP 20</h3>{trend.failedItems.length === 0 ? <div className="py-12 text-center text-sm text-gray-400">当前范围内无逐项不合格记录。</div> : <ol className="mt-3 divide-y divide-gray-100">{trend.failedItems.map((item, index) => <li key={item.name} className="flex items-center justify-between py-2 text-sm"><span><span className="mr-2 text-gray-400">{index + 1}</span>{item.name}</span><span className="font-medium text-red-600">{item.count} 次</span></li>)}</ol>}</section>
        </div>
        <section className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-200 px-4 py-3"><h3 className="font-semibold text-gray-900">物料质量排名</h3></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-slate-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-3">物料</th><th className="px-4 py-3">完成批次</th><th className="px-4 py-3">不合格批次</th><th className="px-4 py-3">部分判定</th><th className="px-4 py-3">样本合格率</th></tr></thead><tbody className="divide-y divide-gray-100">{trend.byMaterial.map((item) => <tr key={item.materialId}><td className="px-4 py-3 font-medium text-gray-900">{item.code} · {item.name}</td><td className="px-4 py-3">{item.completedInspections}</td><td className="px-4 py-3 text-red-600">{item.failedInspections}</td><td className="px-4 py-3">{item.partialInspections}</td><td className="px-4 py-3">{item.samplePassRate}%</td></tr>)}</tbody></table>{trend.byMaterial.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-400">当前范围内无物料统计。</div>}</div></section>
      </>}
    </section>
  )
}
