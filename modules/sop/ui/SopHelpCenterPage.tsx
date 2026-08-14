'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import SopWorkflowCard from './SopWorkflowCard'
import { useSopCatalog } from './useSopCatalog'

export default function SopHelpCenterPage({ pageKey, standalone = false }: { pageKey?: string; standalone?: boolean } = {}) {
  const { catalog, error } = useSopCatalog(pageKey)
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const chapters = useMemo(() => catalog?.chapters.flatMap((chapter) => {
    const workflows = chapter.workflows.filter((workflow) => !normalized || [workflow.title, workflow.objective, workflow.result, ...workflow.steps].join(' ').toLocaleLowerCase().includes(normalized))
    return workflows.length > 0 ? [{ ...chapter, workflows }] : []
  }) || [], [catalog, normalized])
  const count = chapters.reduce((total, chapter) => total + chapter.workflows.length, 0)

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
  if (!catalog) return <div className="p-8 text-center text-sm text-slate-500">正在加载作业指导书…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3"><BookOpen className="h-7 w-7" /><h2 className="text-2xl font-bold">{catalog.title}</h2></div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-blue-100">{pageKey ? '当前页面相关流程已在独立页面全屏展开；' : ''}按当前账号权限显示，内容、Web 帮助与 DOCX/PDF 均来自同一份 SOP 清单。</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/10 px-3 py-1.5">系统 v{catalog.version}</span><span className="rounded-full bg-white/10 px-3 py-1.5">可读流程 {catalog.workflowCount}</span><span className="rounded-full bg-white/10 px-3 py-1.5">章节 {catalog.chapters.length}</span></div>
        {standalone && pageKey && <a href="/help" className="mt-5 inline-flex rounded-lg border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">查看全部流程</a>}
      </section>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Search className="h-5 w-5 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面、操作、结果或关键字" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <span className="text-xs text-slate-400">{count} 项</span>
      </label>
      {chapters.map((chapter) => (
        <section key={chapter.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{chapter.title}</h2>
          <div className="grid gap-3 xl:grid-cols-2">{chapter.workflows.map((workflow) => <SopWorkflowCard key={workflow.id} workflow={workflow} compact />)}</div>
        </section>
      ))}
      {count === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">没有匹配的流程。</div>}
    </div>
  )
}
