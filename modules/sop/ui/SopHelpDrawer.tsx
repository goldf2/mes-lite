'use client'

import { BookOpen, ExternalLink, X } from 'lucide-react'
import SopWorkflowCard from './SopWorkflowCard'
import { useSopCatalog } from './useSopCatalog'

export default function SopHelpDrawer({ pageKey, pageLabel, onClose }: { pageKey: string; pageLabel: string; onClose: () => void }) {
  const { catalog, error } = useSopCatalog(pageKey)
  const workflows = catalog?.chapters.flatMap((chapter) => chapter.workflows) || []
  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`${pageLabel}操作帮助`} onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-slate-50 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div><div className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen className="h-5 w-5 text-blue-600" />当前页面帮助</div><div className="mt-1 text-xs text-slate-500">{pageLabel} · {workflows.length} 个相关流程</div></div>
          <button type="button" aria-label="关闭操作帮助" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {!catalog && !error && <div className="p-8 text-center text-sm text-slate-500">正在加载…</div>}
          {catalog && workflows.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">当前页面暂时没有关联流程，请进入完整帮助中心检索。</div>}
          {workflows.map((workflow) => <SopWorkflowCard key={workflow.id} workflow={workflow} compact />)}
        </div>
        <footer className="grid gap-2 border-t border-slate-200 bg-white p-4 sm:grid-cols-2">
          <a href={`/help?pageKey=${encodeURIComponent(pageKey)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
            <ExternalLink className="h-4 w-4" />新页面全屏查看
          </a>
          <a href="/help" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            <ExternalLink className="h-4 w-4" />打开完整帮助中心
          </a>
        </footer>
      </aside>
    </div>
  )
}
