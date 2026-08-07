'use client'

import { SearchCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  buildAdvancedSearchDraft,
  defaultResourceSearchOperators,
} from '@/lib/resource-search'
import type {
  ResourceAdvancedSearchField,
  ResourceSearchCondition,
  ResourceSearchOperator,
} from '@/lib/resource-search'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import ControlTooltip from '../ControlTooltip'
import ModalOverlay from '../ModalOverlay'

const operatorLabels: Record<ResourceSearchOperator, string> = {
  equals: '等于',
  contains: '包含',
  startsWith: '开头是',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
}

export default function ResourceAdvancedSearch<T>({
  fields,
  conditions,
  onChange,
}: {
  fields: readonly ResourceAdvancedSearchField<T>[]
  conditions: readonly ResourceSearchCondition[]
  onChange: (conditions: ResourceSearchCondition[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [draft, setDraft] = useState<ResourceSearchCondition[]>(() => buildAdvancedSearchDraft(fields, conditions))
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open && !compact, () => setOpen(false))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)')
    const sync = () => setCompact(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!open) setDraft(buildAdvancedSearchDraft(fields, conditions))
  }, [conditions, fields, open])

  if (fields.length === 0) return null

  const update = (id: string, patch: Partial<ResourceSearchCondition>) => {
    setDraft((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition))
  }

  const panelContent = (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">高级搜索</div>
          <div className="mt-0.5 text-xs text-gray-500">按明确字段输入条件；已填写的字段必须同时满足。</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="关闭高级搜索" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>

      <div className="max-h-[min(62dvh,520px)] space-y-2 overflow-y-auto p-3">
        {fields.map((field) => {
          const condition = draft.find((candidate) => candidate.field === field.key)
          if (!condition) return null
          const operators = field.operators || defaultResourceSearchOperators(field.type)
          return (
            <label key={field.key} className="grid grid-cols-[9rem_8rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 max-sm:grid-cols-1">
              <span className="px-1 text-sm font-medium text-gray-700">{field.label}</span>
              <select value={condition.operator} onChange={(event) => update(condition.id, { operator: event.target.value as ResourceSearchOperator })} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
                {operators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
              </select>
              {field.options ? (
                <select value={condition.value} onChange={(event) => update(condition.id, { value: event.target.value })} className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm">
                  <option value="">请选择</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  value={condition.value}
                  onChange={(event) => update(condition.id, { value: event.target.value })}
                  className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm"
                  placeholder={`输入${field.label}`}
                />
              )}
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
        <button type="button" onClick={() => setDraft(buildAdvancedSearchDraft(fields, []))} className="text-sm text-gray-500 hover:text-gray-800">清空</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">取消</button>
          <button type="button" onClick={() => { onChange(draft.filter((condition) => condition.value.trim())); setOpen(false) }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">应用条件</button>
        </div>
      </div>
    </>
  )

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="高级搜索"
        className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <SearchCheck aria-hidden="true" className="h-4 w-4 text-blue-600" />
        <span className="sr-only">高级搜索</span>
        {conditions.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 text-white">{conditions.length}</span>}
        <ControlTooltip label="高级搜索" hidden={open} />
      </button>

      {open && (compact ? (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="高级搜索" tabIndex={-1} className="flex max-h-[calc(100dvh-2rem)] w-[min(92vw,42rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            {panelContent}
          </div>
        </ModalOverlay>
      ) : (
        <div role="dialog" aria-label="高级搜索" className="absolute right-0 top-[calc(100%+8px)] z-[150] w-[min(680px,calc(100vw-24px))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {panelContent}
        </div>
      ))}
    </div>
  )
}
