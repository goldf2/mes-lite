'use client'

import { ReactNode, createContext, useContext } from 'react'
import { attachmentTypeLabel } from '@/lib/attachment-file-types'
import type { AttachmentItem, PanoramaDisplayDensity, ProcessRouteSummary, ProcessTemplateSummary } from '../../contracts/material-panorama'
import { formatMoney, formatNumber, processCategoryLabels, processCostPerThousand } from '../../model/material-panorama-view'

export const PanoramaDensityContext = createContext<PanoramaDisplayDensity>('comfortable')
export const PanoramaDensityProvider = PanoramaDensityContext.Provider

export function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  const density = useContext(PanoramaDensityContext)
  return (
    <section className={`self-start rounded-lg border border-gray-200 bg-white shadow-sm ${density === 'compact' ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4'}`}>
      <div className={`flex items-center justify-between gap-3 ${density === 'compact' ? 'mb-2' : 'mb-2.5'}`}>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action && <span className="text-xs text-gray-500">{action}</span>}
      </div>
      {children}
    </section>
  )
}

export function Metric({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'green' | 'blue' | 'amber' }) {
  const density = useContext(PanoramaDensityContext)
  const toneClass = { default: 'text-gray-900', green: 'text-green-700', blue: 'text-blue-700', amber: 'text-amber-700' }[tone]
  return (
    <div className={`min-w-0 rounded-md bg-gray-50 ${density === 'compact' ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 truncate font-semibold ${density === 'compact' ? 'text-sm sm:text-base' : 'text-base sm:text-lg'} ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

export function EmptyText({ children }: { children: ReactNode }) {
  const density = useContext(PanoramaDensityContext)
  return <div className={`rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 ${density === 'compact' ? 'px-3 py-2' : 'px-3 py-3'}`}>{children}</div>
}

export function AttachmentList({ items }: { items: AttachmentItem[] }) {
  const density = useContext(PanoramaDensityContext)
  if (items.length === 0) return <EmptyText>暂无相关附件</EmptyText>
  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {items.slice(0, 8).map((item) => (
        <a key={item.id} href={item.originalUrl || item.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
          <span className="min-w-0 truncate text-gray-800">{item.originalName}</span>
          <span className="shrink-0 text-xs text-gray-500">{attachmentTypeLabel(item.originalName, item.mimeType)}</span>
        </a>
      ))}
    </div>
  )
}

export function ProcessRouteList({ routes }: { routes: ProcessRouteSummary[] }) {
  const density = useContext(PanoramaDensityContext)
  const steps = routes.flatMap((route) => route.steps.map((step) => ({ ...step, routeName: route.name })))
  if (steps.length === 0) return <EmptyText>暂无工艺步骤或作业说明</EmptyText>
  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {steps.slice(0, 10).map((step) => (
        <div key={`${step.routeName}-${step.id}`} className={`rounded-md border border-gray-100 px-3 ${density === 'compact' ? 'py-1.5' : 'py-2'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700">{step.stepNo}</span>
            <span className="font-medium text-gray-900">{step.name}</span>
            <span className="text-xs text-gray-500">{step.workstation || '未设工位'}</span>
          </div>
          {step.description && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{step.description}</div>}
        </div>
      ))}
    </div>
  )
}

export function ProcessTemplateList({ templates }: { templates: ProcessTemplateSummary[] }) {
  const density = useContext(PanoramaDensityContext)
  if (templates.length === 0) return <EmptyText>暂未给该物料关联加工工艺</EmptyText>
  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {templates.map((template) => {
        const totals = processCostPerThousand(template)
        return (
          <div key={template.id} className={`rounded-md border border-gray-100 px-3 ${density === 'compact' ? 'py-1.5' : 'py-2'}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{processCategoryLabels[template.category] || template.category}</span>
              <span className="font-medium text-gray-900">{template.name}</span>
              <span className="font-mono text-xs text-gray-400">{template.code}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">{template.workstation || '未设工位'}{template.defaultTime ? ` · ${template.defaultTime} 分钟` : ''}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800">
              <span>千件人工<br /><b>{formatNumber(totals.laborHours, 2)} h</b></span>
              <span>千件机时<br /><b>{formatNumber(totals.machineHours, 2)} h</b></span>
              <span>千件成本<br /><b>{formatMoney(totals.cost)}</b></span>
            </div>
            {template.description && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{template.description}</div>}
          </div>
        )
      })}
    </div>
  )
}
