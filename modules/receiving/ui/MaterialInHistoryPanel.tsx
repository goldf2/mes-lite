'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import ResourceTable from '@/app/components/resource/ResourceTable'
import type { MaterialInHistorySummary, MaterialInPagination } from '../contracts/material-in'
import { materialInStatusLabels } from '../model/material-in-view'

export interface ReceiptHistoryFilter { startDate: string; endDate: string; includeArchived: boolean }

export default function MaterialInHistoryPanel({ summary, pagination, loading, error, onApply, onPage }: {
  summary: MaterialInHistorySummary[]; pagination: MaterialInPagination; loading: boolean; error: string
  onApply: (filter: ReceiptHistoryFilter) => void; onPage: (page: number) => void
}) {
  const [filter, setFilter] = useState<ReceiptHistoryFilter>({ startDate: '', endDate: '', includeArchived: false })
  return <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
    <h2 className="font-semibold">来料历史核查</h2>
    <p className="text-sm text-gray-500">按来料日期（北京时间，包含起止日）筛选。汇总覆盖下方筛选结果的全部单据和整单明细，不限当前页；物料搜索匹配整单。已收货为当前有效来料，已红冲单据单列，不重复扣减；这里不是期间库存流水净变动。</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); onApply(filter) }}>
      <FormField label="开始日期"><input className={appInputClassName} type="date" value={filter.startDate} max={filter.endDate || undefined} onChange={(event) => setFilter({ ...filter, startDate: event.target.value })} /></FormField>
      <FormField label="结束日期"><input className={appInputClassName} type="date" value={filter.endDate} min={filter.startDate || undefined} onChange={(event) => setFilter({ ...filter, endDate: event.target.value })} /></FormField>
      <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={filter.includeArchived} onChange={(event) => setFilter({ ...filter, includeArchived: event.target.checked })} />包含已归档来料</label>
      <AppButton type="submit" variant="primary" disabled={loading}>查询并统计</AppButton>
    </form>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="text-sm text-gray-500">正在查询…</p> : <>
      <ResourceTable items={summary} getKey={(row) => `${row.status}:${row.unit}`} columns={[
        { key: 'status', label: '当前状态', render: (row) => materialInStatusLabels[row.status] || row.status },
        { key: 'count', label: '明细数', render: (row) => row.lineCount },
        { key: 'qty', label: '数量（不同单位分列）', render: (row) => `${row.qty.toLocaleString('zh-CN', { maximumFractionDigits: 6 })} ${row.unit}` },
        { key: 'amount', label: '单据金额', render: (row) => `¥${row.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      ]} />
      {!summary.length && <p className="text-sm text-gray-500">该范围内没有来料记录。</p>}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>共 {pagination.total} 单 · 第 {pagination.page} / {Math.max(1, pagination.totalPages)} 页 · 每页 {pagination.pageSize} 单（排序作用于当前页）</span>
      <div className="flex gap-2"><AppButton disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>上一页</AppButton><AppButton disabled={loading || pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>下一页</AppButton></div>
    </div>
  </section>
}
