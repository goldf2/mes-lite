'use client'

import { Bookmark, BookmarkPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ResourceSearchCondition } from '@/lib/resource-search'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

const searchPresetEventName = 'mes-lite:search-presets-updated'
const maxPresetCount = 20

type SavedSearchPreset = {
  id: string
  type: 'keyword'
  name: string
  query: string
} | {
  id: string
  type: 'condition'
  name: string
  query: string
  conditions: ResourceSearchCondition[]
}

function presetId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readPresets(storageKey: string): SavedSearchPreset[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): SavedSearchPreset[] => {
      if (typeof item === 'string' && item.trim()) {
        return [{ id: `legacy-${item}`, type: 'keyword', name: item.trim(), query: item.trim() }]
      }
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return []
      if (item.type === 'keyword' && typeof item.query === 'string') {
        return [{ id: String(item.id || presetId()), type: 'keyword', name: item.name, query: item.query }]
      }
      if (item.type === 'condition' && typeof item.query === 'string' && Array.isArray(item.conditions)) {
        return [{ id: String(item.id || presetId()), type: 'condition', name: item.name, query: item.query, conditions: item.conditions }]
      }
      return []
    }).slice(0, maxPresetCount)
  } catch {
    return []
  }
}

function PresetSection({
  title,
  presets,
  onApply,
  onRemove,
}: {
  title: string
  presets: SavedSearchPreset[]
  onApply: (preset: SavedSearchPreset) => void
  onRemove: (preset: SavedSearchPreset) => void
}) {
  if (presets.length === 0) return null
  return (
    <section>
      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold text-gray-400">{title}</div>
      <div className="space-y-1">
        {presets.map((preset) => (
          <div key={preset.id} className="group flex items-center rounded-md hover:bg-gray-50">
            <button type="button" onClick={() => onApply(preset)} title={preset.name} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-gray-700">{preset.name}</button>
            <button type="button" onClick={() => onRemove(preset)} aria-label={`删除快捷搜索 ${preset.name}`} className="mr-1 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function SavedSearchPresets({
  storageKey,
  value,
  onApply,
  conditions = [],
  onApplyConditions,
  conditionLabel,
}: {
  storageKey: string
  value: string
  onApply: (value: string) => void
  conditions?: readonly ResourceSearchCondition[]
  onApplyConditions?: (conditions: ResourceSearchCondition[]) => void
  conditionLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<SavedSearchPreset[]>([])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, () => setOpen(false))
  const currentValue = value.trim()
  const keywordPresets = useMemo(() => presets.filter((preset) => preset.type === 'keyword'), [presets])
  const conditionPresets = useMemo(() => presets.filter((preset) => preset.type === 'condition'), [presets])
  const currentKeywordSaved = useMemo(
    () => keywordPresets.some((preset) => preset.query.toLocaleLowerCase('zh-CN') === currentValue.toLocaleLowerCase('zh-CN')),
    [currentValue, keywordPresets],
  )
  const currentConditionsSaved = useMemo(() => {
    if (conditions.length === 0) return true
    const serialized = JSON.stringify(conditions.map(({ field, operator, value: conditionValue }) => ({ field, operator, value: conditionValue })))
    return conditionPresets.some((preset) => JSON.stringify(preset.conditions.map(({ field, operator, value: conditionValue }) => ({ field, operator, value: conditionValue }))) === serialized)
  }, [conditionPresets, conditions])

  const refreshPresets = useCallback(() => setPresets(readPresets(storageKey)), [storageKey])

  useEffect(() => {
    refreshPresets()
    const handleStorage = (event: StorageEvent) => { if (event.key === storageKey) refreshPresets() }
    const handlePresetUpdate = (event: Event) => { if ((event as CustomEvent<string>).detail === storageKey) refreshPresets() }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(searchPresetEventName, handlePresetUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(searchPresetEventName, handlePresetUpdate)
    }
  }, [refreshPresets, storageKey])

  const persistPresets = (next: SavedSearchPreset[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next.slice(0, maxPresetCount)))
      setPresets(next.slice(0, maxPresetCount))
      window.dispatchEvent(new CustomEvent(searchPresetEventName, { detail: storageKey }))
    } catch {
      // 本地存储不可用时不阻断即时搜索。
    }
  }

  const saveKeyword = () => {
    if (!currentValue || currentKeywordSaved) return
    persistPresets([{ id: presetId(), type: 'keyword', name: currentValue, query: currentValue }, ...presets])
  }

  const saveConditions = () => {
    if (conditions.length === 0 || currentConditionsSaved) return
    persistPresets([{
      id: presetId(),
      type: 'condition',
      name: conditionLabel || `${conditions.length} 个组合条件`,
      query: currentValue,
      conditions: conditions.map((condition) => ({ ...condition })),
    }, ...presets])
  }

  const applyPreset = (preset: SavedSearchPreset) => {
    onApply(preset.query)
    onApplyConditions?.(preset.type === 'condition' ? preset.conditions : [])
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${open ? 'z-[100]' : ''}`}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog" title="快捷搜索" className="inline-flex h-9 w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-0 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:h-10 sm:w-auto sm:px-3 sm:text-sm">
        <Bookmark aria-hidden="true" className="h-4 w-4 text-blue-600" />
        <span className="hidden sm:inline">快捷搜索</span>
        {presets.length > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none text-blue-700">{presets.length}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="快捷搜索" className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[min(340px,calc(100vw-24px))] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div><div className="text-sm font-semibold text-gray-900">快捷搜索</div><div className="mt-0.5 text-xs text-gray-500">按当前资源分别保存关键词和条件搜索</div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭快捷搜索" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>

          <div className="space-y-1">
            {currentValue && !currentKeywordSaved && <button type="button" onClick={saveKeyword} className="flex w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-100"><BookmarkPlus className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">保存关键词“{currentValue}”</span></button>}
            {conditions.length > 0 && !currentConditionsSaved && <button type="button" onClick={saveConditions} className="flex w-full items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-100"><BookmarkPlus className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">保存条件“{conditionLabel || `${conditions.length} 个组合条件`}”</span></button>}
          </div>

          {presets.length > 0 ? (
            <div className="mt-2 max-h-72 overflow-y-auto">
              <PresetSection title="关键词搜索" presets={keywordPresets} onApply={applyPreset} onRemove={(preset) => persistPresets(presets.filter((item) => item.id !== preset.id))} />
              <PresetSection title="条件搜索" presets={conditionPresets} onApply={applyPreset} onRemove={(preset) => persistPresets(presets.filter((item) => item.id !== preset.id))} />
            </div>
          ) : <div className="mt-2 rounded-md bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">输入关键词或应用高级条件后即可保存</div>}

          {(value || conditions.length > 0) && <button type="button" onClick={() => { onApply(''); onApplyConditions?.([]); setOpen(false) }} className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">清除当前搜索</button>}
        </div>
      )}
    </div>
  )
}

export function SearchFieldWithPresets({
  storageKey,
  value,
  onChange,
  placeholder,
  advancedSearch,
  conditions,
  onConditionsChange,
  conditionLabel,
  inputClassName = 'h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm sm:h-10 sm:px-4 sm:py-2',
  className = 'flex w-full min-w-[260px] max-w-[620px] flex-[1_1_420px] items-center gap-2',
}: {
  storageKey: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  advancedSearch?: ReactNode
  conditions?: readonly ResourceSearchCondition[]
  onConditionsChange?: (conditions: ResourceSearchCondition[]) => void
  conditionLabel?: string
  inputClassName?: string
  className?: string
}) {
  return (
    <div className={className}>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className={inputClassName} />
      {advancedSearch}
      <SavedSearchPresets storageKey={storageKey} value={value} onApply={onChange} conditions={conditions} onApplyConditions={onConditionsChange} conditionLabel={conditionLabel} />
    </div>
  )
}
