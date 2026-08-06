'use client'

import { Plus, SearchCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  ResourceAdvancedSearchField,
  ResourceSearchCondition,
  ResourceSearchOperator,
} from '@/lib/resource-search'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import ControlTooltip from '../ControlTooltip'

const operatorLabels: Record<ResourceSearchOperator, string> = {
  equals: '等于',
  contains: '包含',
  startsWith: '开头是',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
}

function defaultOperators(type: ResourceAdvancedSearchField<unknown>['type']): readonly ResourceSearchOperator[] {
  if (type === 'number' || type === 'date') return ['equals', 'gt', 'gte', 'lt', 'lte']
  if (type === 'select') return ['equals']
  return ['equals', 'contains', 'startsWith']
}

function newCondition(field: ResourceAdvancedSearchField<unknown>): ResourceSearchCondition {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: field.key,
    operator: (field.operators || defaultOperators(field.type))[0],
    value: '',
  }
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
  const [draft, setDraft] = useState<ResourceSearchCondition[]>(conditions.slice())
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, () => setOpen(false))

  useEffect(() => {
    if (!open) setDraft(conditions.slice())
  }, [conditions, open])

  if (fields.length === 0) return null

  const update = (id: string, patch: Partial<ResourceSearchCondition>) => {
    setDraft((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition))
  }

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

      {open && (
        <div role="dialog" aria-label="高级搜索" className="absolute right-0 top-[calc(100%+8px)] z-[150] w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">高级搜索</div>
              <div className="mt-0.5 text-xs text-gray-500">所有条件同时满足；字段范围由当前资源定义。</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭高级搜索" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
          </div>

          <div className="max-h-[min(52dvh,420px)] space-y-2 overflow-y-auto p-3">
            {draft.map((condition) => {
              const field = fields.find((candidate) => candidate.key === condition.field) || fields[0]
              const operators = field.operators || defaultOperators(field.type)
              return (
                <div key={condition.id} className="grid grid-cols-[minmax(0,1fr)_8rem_2fr_auto] gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 max-sm:grid-cols-1">
                  <select
                    value={condition.field}
                    onChange={(event) => {
                      const nextField = fields.find((candidate) => candidate.key === event.target.value) || fields[0]
                      update(condition.id, { field: nextField.key, operator: (nextField.operators || defaultOperators(nextField.type))[0], value: '' })
                    }}
                    className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm"
                  >
                    {fields.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
                  </select>
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
                      placeholder="输入精确条件"
                    />
                  )}
                  <button type="button" onClick={() => setDraft((current) => current.filter((item) => item.id !== condition.id))} aria-label="删除条件" className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              )
            })}

            <button type="button" onClick={() => setDraft((current) => [...current, newCondition(fields[0] as ResourceAdvancedSearchField<unknown>)])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" />添加条件</button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
            <button type="button" onClick={() => setDraft([])} className="text-sm text-gray-500 hover:text-gray-800">清空</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">取消</button>
              <button type="button" onClick={() => { onChange(draft.filter((condition) => condition.value.trim())); setOpen(false) }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">应用条件</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
