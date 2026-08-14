'use client'

import { useCallback, useEffect, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { loadQualityTasks } from '../client/quality-inspection-api'
import type { QualityTaskFilter, QualityTaskWorkspace } from '../contracts/quality-task'
import QualityLotCard from './QualityLotCard'
import QualityInspectionStandardsPanel from './QualityInspectionStandardsPanel'
import QualityTrendPanel from './QualityTrendPanel'

const emptyWorkspace: QualityTaskWorkspace = { items: [], counts: { pending: 0, disposition: 0 } }

function readInitialFilter(): QualityTaskFilter {
  if (typeof window === 'undefined') return 'PENDING'
  return new URL(window.location.href).searchParams.get('task') === 'quality-disposition' ? 'DISPOSITION' : 'PENDING'
}

type QualityWorkspaceView = 'TASKS' | 'STANDARDS' | 'TRENDS'

export default function QualityTaskPageModule({
  canDecide, canDispose, canRelease, canReadStandards, canCreateStandards, canUpdateStandards,
  canReadAttachments, canManageAttachments, onMessage,
}: {
  canDecide: boolean
  canDispose: boolean
  canRelease: boolean
  canReadStandards: boolean
  canCreateStandards: boolean
  canUpdateStandards: boolean
  canReadAttachments: boolean
  canManageAttachments: boolean
  onMessage: (message: string) => void
}) {
  const [view, setView] = useState<QualityWorkspaceView>('TASKS')
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [filter, setFilter] = useState<QualityTaskFilter>(readInitialFilter)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setWorkspace(await loadQualityTasks(filter, keyword)) } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '获取质量任务失败'
      setError(message)
      onMessage(message)
    } finally { setLoading(false) }
  }, [filter, keyword, onMessage])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <>
      {view === 'TASKS' && <TopBarPortal>
        <ResponsiveToolbarActions primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.qualityTasks" value={keyword} onChange={setKeyword} placeholder="搜索检验单、批次、物料或来源单据" />} />
      </TopBarPortal>}
      <section className="rounded-lg bg-white p-3 shadow sm:p-6">
      <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <AppButton size="sm" variant={view === 'TASKS' ? 'primary' : 'secondary'} onClick={() => setView('TASKS')}>质量任务</AppButton>
        {canReadStandards && <AppButton size="sm" variant={view === 'STANDARDS' ? 'primary' : 'secondary'} onClick={() => setView('STANDARDS')}>检验标准</AppButton>}
        <AppButton size="sm" variant={view === 'TRENDS' ? 'primary' : 'secondary'} onClick={() => setView('TRENDS')}>质量趋势</AppButton>
      </div>
      {view === 'STANDARDS' ? <QualityInspectionStandardsPanel canCreate={canCreateStandards} canUpdate={canUpdateStandards} onMessage={onMessage} /> : view === 'TRENDS' ? <QualityTrendPanel canReadStandards={canReadStandards} onMessage={onMessage} /> : <>
      <div><h2 className="text-lg font-semibold text-gray-900">质量任务工作台</h2><p className="mt-1 text-sm text-gray-500">按车间任务处理待检、冻结和返工批次；每次判定与处置均保留独立追溯记录。</p></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ['PENDING', `待检任务 ${workspace.counts.pending}`],
          ['DISPOSITION', `待处置批次 ${workspace.counts.disposition}`],
          ['ALL', '全部记录'],
        ] as Array<[QualityTaskFilter, string]>).map(([key, label]) => (
          <AppButton key={key} size="sm" variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label}</AppButton>
        ))}
      </div>
      <div className="mt-5">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && workspace.items.length === 0 ? <AppLoadingIndicator label="正在读取质量任务..." /> : workspace.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">当前筛选条件下没有质量任务。</div>
        ) : <div className="space-y-3">{workspace.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><span className="font-medium text-gray-900">{item.lot.material.code} · {item.lot.material.name}</span><span className="ml-2 text-gray-500">来源 {item.sourceType} / {item.sourceId}</span></div><span className="text-gray-500">创建 {new Date(item.createdAt).toLocaleString('zh-CN')}</span></div>
            <QualityLotCard lot={{ ...item.lot, inspections: [item] }} canDecide={canDecide} canDispose={canDispose} canRelease={canRelease} canReadAttachments={canReadAttachments} canManageAttachments={canManageAttachments} onChanged={load} onMessage={onMessage} />
          </div>
        ))}</div>}
      </div></>}
      </section>
    </>
  )
}
