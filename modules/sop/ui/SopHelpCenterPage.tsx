'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Download, Film, Search } from 'lucide-react'
import SopWorkflowCard from './SopWorkflowCard'
import SopVideoCard from './SopVideoCard'
import { useSopCatalog } from './useSopCatalog'

export default function SopHelpCenterPage({ pageKey, standalone = false }: { pageKey?: string; standalone?: boolean } = {}) {
  const { catalog, error } = useSopCatalog(pageKey)
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const videos = useMemo(() => catalog?.videos || [], [catalog])
  const matchingVideos = useMemo(() => videos.filter((video) => !normalized || [video.title, video.description].join(' ').toLocaleLowerCase().includes(normalized)), [normalized, videos])
  const chapters = useMemo(() => catalog?.chapters.flatMap((chapter) => {
    const workflows = chapter.workflows.filter((workflow) => !normalized || [workflow.title, workflow.objective, workflow.result, ...workflow.steps].join(' ').toLocaleLowerCase().includes(normalized))
    const chapterVideos = matchingVideos.filter((video) => video.chapterId === chapter.id)
    return workflows.length > 0 || chapterVideos.length > 0 ? [{ ...chapter, workflows, videos: chapterVideos }] : []
  }) || [], [catalog, matchingVideos, normalized])
  const count = chapters.reduce((total, chapter) => total + chapter.workflows.length, 0)
  const videoCount = chapters.reduce((total, chapter) => total + chapter.videos.length, 0)
  const downloads = catalog?.downloads || []
  const ungroupedVideos = matchingVideos.filter((video) => !(catalog?.chapters || []).some((chapter) => chapter.id === video.chapterId))

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
  if (!catalog) return <div className="p-8 text-center text-sm text-slate-500">正在加载作业指导书…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3"><BookOpen className="h-7 w-7" /><h2 className="text-2xl font-bold">{catalog.title}</h2></div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-blue-100">{pageKey ? '当前页面相关流程已在独立页面全屏展开；' : ''}按当前账号权限显示，内容、Web 帮助与 DOCX/PDF 均来自同一份 SOP 清单。</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/10 px-3 py-1.5">系统 v{catalog.version}</span><span className="rounded-full bg-white/10 px-3 py-1.5">可读流程 {catalog.workflowCount}</span><span className="rounded-full bg-white/10 px-3 py-1.5">视频 {videos.length}</span><span className="rounded-full bg-white/10 px-3 py-1.5">章节 {catalog.chapters.length}</span></div>
        {(Boolean(standalone && pageKey) || downloads.length > 0) && <div className="mt-5 flex flex-wrap gap-2">
          {standalone && pageKey && <a href="/help" className="inline-flex rounded-lg border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">查看全部流程</a>}
          {downloads.map((download) => <a key={download.format} href={download.url} target="_blank" rel="noopener noreferrer" download={download.fileName} className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
            <Download className="h-4 w-4" />{download.label}
          </a>)}
        </div>}
      </section>
      {ungroupedVideos.length > 0 && <section className="space-y-3">
        <div className="flex items-center gap-2"><Film className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-semibold text-slate-900">{pageKey ? '当前页面视频' : '其他视频'}</h2><span className="text-xs text-slate-400">{ungroupedVideos.length} 项</span></div>
        <div className="grid gap-4 xl:grid-cols-2">{ungroupedVideos.map((video) => <SopVideoCard key={video.id} video={video} />)}</div>
      </section>}
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Search className="h-5 w-5 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面、操作、结果或关键字" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <span className="text-xs text-slate-400">{count} 个流程 · {videoCount + ungroupedVideos.length} 个视频</span>
      </label>
      {chapters.map((chapter) => (
        <section key={chapter.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{chapter.title}</h2>
          {chapter.videos.length > 0 && <div className="grid gap-4 xl:grid-cols-2">{chapter.videos.map((video) => <SopVideoCard key={video.id} video={video} />)}</div>}
          <div className="grid gap-3 xl:grid-cols-2">{chapter.workflows.map((workflow) => <SopWorkflowCard key={workflow.id} workflow={workflow} compact />)}</div>
        </section>
      ))}
      {count === 0 && videoCount + ungroupedVideos.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">没有匹配的流程或视频。</div>}
    </div>
  )
}
