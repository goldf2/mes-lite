'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SopWorkflow } from '../contracts/sop'

export default function SopWorkflowCard({ workflow, compact = false }: { workflow: SopWorkflow; compact?: boolean }) {
  const [open, setOpen] = useState(!compact)
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50">
        <div className="min-w-0">
          <div className="text-xs font-medium text-blue-700">{workflow.roles.join(' · ')}</div>
          <h3 className="mt-1 font-semibold text-slate-900">{workflow.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{workflow.objective}</p>
        </div>
        {open ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <ol className="space-y-2">
            {workflow.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
            <span className="font-semibold">结果检查：</span>{workflow.result}
          </div>
          {workflow.screenshotUrl && <img src={workflow.screenshotUrl} alt={`${workflow.title}操作截图`} loading="lazy" className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50" />}
          <div className="mt-2 text-xs text-slate-400">截图验证基线 v{workflow.lastVerifiedVersion}</div>
        </div>
      )}
    </article>
  )
}
