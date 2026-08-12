'use client'

import { useCallback, useEffect, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import AppButton from '@/app/components/AppButton'
import { appInputClassName } from '@/app/components/FormField'
import { loadQualityTasks } from '../client/quality-inspection-api'
import type { QualityTaskFilter, QualityTaskWorkspace } from '../contracts/quality-task'
import QualityLotCard from './QualityLotCard'

const emptyWorkspace: QualityTaskWorkspace = { items: [], counts: { pending: 0, disposition: 0 } }

export default function QualityTaskPageModule({ canDecide, canDispose, canRelease, onMessage }: {
  canDecide: boolean
  canDispose: boolean
  canRelease: boolean
  onMessage: (message: string) => void
}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [filter, setFilter] = useState<QualityTaskFilter>('PENDING')
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
    <section className="rounded-lg bg-white p-3 shadow sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-lg font-semibold text-gray-900">质量任务工作台</h2><p className="mt-1 text-sm text-gray-500">按车间任务处理待检、冻结和返工批次；每次判定与处置均保留独立追溯记录。</p></div>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className={`${appInputClassName} w-full lg:w-80`} placeholder="搜索检验单、批次、物料或来源单据" />
      </div>
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
            <QualityLotCard lot={{ ...item.lot, inspections: [item] }} canDecide={canDecide} canDispose={canDispose} canRelease={canRelease} onChanged={load} onMessage={onMessage} />
          </div>
        ))}</div>}
      </div>
    </section>
  )
}
