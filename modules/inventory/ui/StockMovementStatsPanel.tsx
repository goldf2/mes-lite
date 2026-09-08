'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { appInputClassName } from '@/app/components/FormField'
import { loadStockMovementStats } from '../client/stock-movement-stats-api'
import type { StockMovementStatsWorkspace } from '../contracts/stock-movement-stats'

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function quantity(value: number | null, unit = '') {
  if (value === null) return '多单位'
  const text = Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
  return unit ? `${text} ${unit}` : text
}

const emptyStats: StockMovementStatsWorkspace = {
  range: { startDate: '', endDate: '' },
  summary: { movementCount: 0, stockUnits: [], inQty: 0, outQty: 0, netQty: 0, netValuationQty: 0, netCostAmount: 0, incomingInQty: 0, incomingOutQty: 0, incomingNetQty: 0 },
  byType: [], byMaterial: [], byLocation: [],
}

export default function StockMovementStatsPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const initialDates = useMemo(() => ({ startDate: dateValue(new Date(Date.now() - 29 * 86_400_000)), endDate: dateValue(new Date()) }), [])
  const [filters, setFilters] = useState({ ...initialDates, materialId: '', locationId: '' })
  const [stats, setStats] = useState(emptyStats)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) return
    setLoading(true)
    try {
      setStats(await loadStockMovementStats(filters))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取数量变动统计失败')
    } finally {
      setLoading(false)
    }
  }, [filters, onMessage])

  useEffect(() => { void load() }, [load])

  const unit = stats.summary.stockUnits.length === 1 ? stats.summary.stockUnits[0] : ''
  const summaryQuantity = (value: number | null) => quantity(value, unit)
  const summaryTone = (value: number | null, positive = 'text-blue-700') => value === null ? 'text-gray-500' : value >= 0 ? positive : 'text-red-700'
  return (
    <section className="mb-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="font-semibold text-gray-900">数量变动统计</h3><p className="mt-1 text-xs text-gray-500">按库存流水统计指定日期内的来料、生产、发货、退货、移库、调整和冲销；不另建统计账。</p></div>
        <span className="text-xs text-gray-500">共 {stats.summary.movementCount} 条流水</span>
      </div>
      <div className="mt-4 grid gap-3 rounded-lg border border-blue-100 bg-white p-3 md:grid-cols-3">
        <label className="text-xs font-medium text-gray-700">开始日期<input type="date" value={filters.startDate} max={filters.endDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} className={`mt-1 ${appInputClassName}`} /></label>
        <label className="text-xs font-medium text-gray-700">结束日期<input type="date" value={filters.endDate} min={filters.startDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} className={`mt-1 ${appInputClassName}`} /></label>
        <div className="flex items-end"><AppButton fullWidth variant="primary" onClick={() => void load()} disabled={loading}>刷新统计</AppButton></div>
      </div>
      {loading && stats.summary.movementCount === 0 ? <div className="mt-4"><AppLoadingIndicator label="正在统计数量变动..." /></div> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['增加数量', summaryQuantity(stats.summary.inQty), 'text-emerald-700'],
            ['减少数量', summaryQuantity(stats.summary.outQty), 'text-amber-700'],
            ['净变动', summaryQuantity(stats.summary.netQty), summaryTone(stats.summary.netQty)],
            ['来料净变动', summaryQuantity(stats.summary.incomingNetQty), summaryTone(stats.summary.incomingNetQty, 'text-emerald-700')],
            ['净成本变动', `¥${stats.summary.netCostAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'text-gray-900'],
          ].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-gray-100 bg-white p-3"><div className="text-xs text-gray-500">{label}</div><div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div></div>)}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-3 py-2.5"><h4 className="font-semibold text-gray-900">按流水类型</h4></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">类型</th><th className="px-3 py-2">增加</th><th className="px-3 py-2">减少</th><th className="px-3 py-2">净变动</th></tr></thead><tbody className="divide-y divide-gray-100">{stats.byType.map((item) => <tr key={item.key}><td className="px-3 py-2 font-medium text-gray-700">{item.label}<span className="ml-1 text-xs text-gray-400">({item.movementCount})</span></td><td className="px-3 py-2 text-emerald-700">{quantity(item.inQty, item.stockUnit)}</td><td className="px-3 py-2 text-amber-700">{quantity(item.outQty, item.stockUnit)}</td><td className={`px-3 py-2 font-medium ${item.netQty >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{quantity(item.netQty, item.stockUnit)}</td></tr>)}</tbody></table>{stats.byType.length === 0 && <div className="px-3 py-8 text-center text-sm text-gray-400">当前日期范围内无数量变动。</div>}</div></section>
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-3 py-2.5"><h4 className="font-semibold text-gray-900">按物料</h4></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">物料</th><th className="px-3 py-2">增加</th><th className="px-3 py-2">减少</th><th className="px-3 py-2">净变动</th></tr></thead><tbody className="divide-y divide-gray-100">{stats.byMaterial.slice(0, 10).map((item) => <tr key={item.objectId}><td className="max-w-64 px-3 py-2"><div className="truncate font-medium text-gray-700" title={`${item.code} · ${item.name}`}>{item.code} · {item.name}</div><div className="mt-0.5 truncate text-xs text-gray-400">{item.spec || '无规格'} · {item.movementCount} 条</div></td><td className="px-3 py-2 text-emerald-700">{quantity(item.inQty, item.stockUnit)}</td><td className="px-3 py-2 text-amber-700">{quantity(item.outQty, item.stockUnit)}</td><td className={`px-3 py-2 font-medium ${item.netQty >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{quantity(item.netQty, item.stockUnit)}</td></tr>)}</tbody></table>{stats.byMaterial.length === 0 && <div className="px-3 py-8 text-center text-sm text-gray-400">当前日期范围内无物料变动。</div>}</div></section>
        </div>
      </>}
    </section>
  )
}
