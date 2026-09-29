'use client'

import { useEffect, useState } from 'react'
import AppButton from '../AppButton'
import FormField, { appInputClassName } from '../FormField'
import ResourceTable from './ResourceTable'
import TopBarPortal from '../TopBarPortal'

export interface HistoryFilter { startDate: string; endDate: string; keyword: string; status: string; includeArchived: boolean }
export interface HistoryLine { id: string; documentNo: string; date: string | null; party: string; material: string; spec: string; qty: number; unit: string; unitPrice: number; priceUnit: string; amount: number; status: string; archived: boolean }
export interface HistoryResult {
  lines: HistoryLine[]
  summary: { status: string; unit: string; qty: number; amount: number; lineCount: number }[]
  pagination: { page: number; total: number; totalPages: number }
}
export interface HistoryAdapter { title: string; description: string; dateLabel: string; statuses: Record<string, string>; load: (params: URLSearchParams) => Promise<HistoryResult>; download: (params: URLSearchParams) => Promise<Blob> }
const emptyFilter: HistoryFilter = { startDate: '', endDate: '', keyword: '', status: '', includeArchived: false }
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未发货'

export default function DocumentHistoryPage({ adapter }: { adapter: HistoryAdapter }) {
  const [draft, setDraft] = useState(emptyFilter)
  const [query, setQuery] = useState({ filter: emptyFilter, page: 1, revision: 0 })
  const [result, setResult] = useState<HistoryResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(query.filter)
  const params = new URLSearchParams({ ...query.filter, includeArchived: String(query.filter.includeArchived), page: String(query.page), pageSize: '20', includeSummary: 'true' })
  const queryString = params.toString()
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setResult(null)
    adapter.load(new URLSearchParams(queryString)).then(data => { if (active) setResult(data) }).catch(err => { if (active) setError(err instanceof Error ? err.message : '查询失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [adapter, queryString, query.revision])
  const download = async () => {
    setExporting(true); setError('')
    try {
      const blob = await adapter.download(new URLSearchParams(queryString))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = `${adapter.title}_${query.filter.startDate || '全部'}_${query.filter.endDate || '至今'}.csv`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err instanceof Error ? err.message : '导出失败') } finally { setExporting(false) }
  }
  return <div className="space-y-4">
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="font-semibold">{adapter.title}</h2>
      <p className="text-sm text-gray-500">{adapter.description} 日期采用北京时间，包含起止日；搜索匹配整单，汇总和 CSV 覆盖全部匹配单据的所有明细，不限当前页。</p>
      <TopBarPortal><form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setLoading(true); setQuery({ filter: draft, page: 1, revision: query.revision + 1 }) }}>
        <FormField label={`${adapter.dateLabel}起始`}><input type="date" className={appInputClassName} value={draft.startDate} max={draft.endDate || undefined} onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></FormField>
        <FormField label={`${adapter.dateLabel}截止`}><input type="date" className={appInputClassName} value={draft.endDate} min={draft.startDate || undefined} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></FormField>
        <FormField label="单号、往来单位或物料"><input className={appInputClassName} value={draft.keyword} onChange={e => setDraft({ ...draft, keyword: e.target.value })} /></FormField>
        <FormField label="状态"><select className={appInputClassName} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">全部状态</option>{Object.entries(adapter.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={draft.includeArchived} onChange={e => setDraft({ ...draft, includeArchived: e.target.checked })} />包含已归档</label>
        <AppButton type="submit" variant="primary" disabled={loading}>查询并统计</AppButton>
        <AppButton disabled={loading || exporting || changed || !result?.lines.length} onClick={download}>{exporting ? '正在导出…' : '导出全部明细 CSV'}</AppButton>
      </form></TopBarPortal>
      <p className="text-xs text-gray-500">CSV 可用 Excel 打开；变更筛选后请先查询。只读核查，不修改库存。不同状态和单位分开统计，红冲单不重复扣减；不是库存净变动报表。</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading && <p role="status">正在查询…</p>}
      {result && <ResourceTable items={result.summary} getKey={row => `${row.status}:${row.unit}`} columns={[
        { key: 'status', label: '状态', render: row => adapter.statuses[row.status] || row.status },
        { key: 'count', label: '明细数', render: row => row.lineCount },
        { key: 'qty', label: '数量（单位分列）', render: row => `${row.qty.toLocaleString()} ${row.unit}` },
        { key: 'amount', label: '单据金额（元）', render: row => row.amount.toFixed(2) },
      ]} />}
    </section>
    {result && <section className="space-y-3 rounded-lg border bg-white p-4">
      <ResourceTable items={result.lines} getKey={row => row.id} columns={[
        { key: 'document', label: '单号', render: row => row.documentNo }, { key: 'date', label: adapter.dateLabel, render: row => dateLabel(row.date) },
        { key: 'party', label: '往来单位', render: row => row.party }, { key: 'material', label: '物料', render: row => row.material }, { key: 'spec', label: '规格', render: row => row.spec },
        { key: 'qty', label: '数量', render: row => `${row.qty} ${row.unit}` }, { key: 'price', label: '单价（元/计价单位）', render: row => `${row.unitPrice} / ${row.priceUnit || '未记录'}` }, { key: 'amount', label: '明细金额（元）', render: row => row.amount.toFixed(2) },
        { key: 'status', label: '状态', render: row => `${adapter.statuses[row.status] || row.status}${row.archived ? ' · 已归档' : ''}` },
      ]} />
      {!result.lines.length && <p>没有符合条件的记录。</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span>共 {result.pagination.total} 单 · 第 {result.pagination.page} / {Math.max(1, result.pagination.totalPages)} 页（每页 20 单，展开全部明细）</span><div className="flex gap-2"><AppButton disabled={loading || query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>上一页</AppButton><AppButton disabled={loading || query.page >= result.pagination.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>下一页</AppButton></div></div>
    </section>}
  </div>
}
