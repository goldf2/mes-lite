'use client'

import { useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { defineResourceSearchCatalog, filterBySearchCatalog, resourceAdvancedFields } from '@/lib/resource-search'
import type { ResourceSearchCondition } from '@/lib/resource-search'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'

export interface WorkspaceFunctionItem {
  key: WorkspaceFunctionKey
  label: string
  groupKey: string
  groupLabel: string
  description: string
  icon: string
  externalHref?: string
  sourceLabel?: string
}

export type SaveWorkspacePreference = (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>

const functionSearchCatalog = defineResourceSearchCatalog<WorkspaceFunctionItem>('workspace-function.actual-fields', [
  { key: 'label', label: '功能名称', type: 'text', read: (item) => item.label },
  { key: 'group', label: '业务分组', type: 'text', read: (item) => [item.groupKey, item.groupLabel] },
  { key: 'description', label: '功能说明', type: 'text', read: (item) => item.description },
  { key: 'key', label: '功能标识', type: 'text', read: (item) => item.key },
])
const functionAdvancedSearchFields = resourceAdvancedFields(functionSearchCatalog)

export function groupWorkspaceFunctions(items: WorkspaceFunctionItem[]) {
  const groups = new Map<string, { key: string; label: string; items: WorkspaceFunctionItem[] }>()
  for (const item of items) {
    const group = groups.get(item.groupKey) || { key: item.groupKey, label: item.groupLabel, items: [] }
    group.items.push(item)
    groups.set(item.groupKey, group)
  }
  return Array.from(groups.values())
}

export function useWorkspaceFunctionSearch(items: WorkspaceFunctionItem[]) {
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  return {
    keyword, setKeyword, conditions, setConditions,
    searching: Boolean(keyword.trim() || conditions.length),
    visibleItems: filterBySearchCatalog(items, keyword, functionSearchCatalog, conditions),
  }
}

export function useWorkspacePreferenceActions(preference: WorkspacePreferenceValue, onSave: SaveWorkspacePreference, busy = false) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const savePreference = async (next: Parameters<SaveWorkspacePreference>[0]) => {
    if (busy || savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(next)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存工作台设置失败，请重试')
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  const toggleFavorite = async (key: WorkspaceFunctionKey) => {
    const pinned = preference.pinned.includes(key)
      ? preference.pinned.filter((item) => item !== key)
      : [...preference.pinned, key]
    await savePreference({ mode: preference.mode, layout: preference.layout, pinned })
  }
  return { saving: saving || busy, error, savePreference, toggleFavorite }
}

export function WorkspaceFunctionSearch({ search, storageKey }: {
  search: ReturnType<typeof useWorkspaceFunctionSearch>
  storageKey: string
}) {
  return (
    <TopBarPortal>
      <ResponsiveToolbarActions
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey={storageKey}
            value={search.keyword}
            onChange={search.setKeyword}
            placeholder="搜索功能名称、分组或说明"
            conditions={search.conditions}
            onConditionsChange={search.setConditions}
            conditionLabel="功能精确搜索"
          />
        )}
        advancedSearch={<ResourceAdvancedSearch fields={functionAdvancedSearchFields} conditions={search.conditions} onChange={search.setConditions} />}
      />
    </TopBarPortal>
  )
}

export function WorkspaceFunctionGroups({ items, preference, saving, onOpen, onToggleFavorite, renderActions, getDragProps }: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  saving: boolean
  onOpen: (key: WorkspaceFunctionKey) => void
  onToggleFavorite: (key: WorkspaceFunctionKey) => void
  renderActions?: (item: WorkspaceFunctionItem) => ReactNode
  getDragProps?: (item: WorkspaceFunctionItem) => HTMLAttributes<HTMLDivElement>
}) {
  const usageByKey = new Map(preference.usage.map((item) => [item.functionKey, item]))
  return (
    <div className="space-y-5">
      {groupWorkspaceFunctions(items).map((group) => (
        <section key={group.key} aria-label={`${group.label}功能`}>
          <h3 className="mb-2 text-sm font-semibold text-gray-600">{group.label}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.items.map((item) => {
              const favorite = preference.pinned.includes(item.key)
              return (
                <div key={item.key} {...getDragProps?.(item)} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 transition hover:border-blue-300 hover:bg-blue-50/50">
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => onOpen(item.key)} aria-label={`打开${item.label}`} className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100/70 text-sm font-semibold text-blue-700">{item.icon}</span>
                        <span className="min-w-0 break-words text-sm font-semibold text-gray-900">{item.label}</span>
                        {item.externalHref && <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                      </span>
                      <span className="mt-2 line-clamp-2 block text-xs leading-5 text-gray-500" title={item.description}>{item.description}</span>
                      <span className="mt-2 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                        {item.sourceLabel && <span>{item.sourceLabel}</span>}
                        {preference.mode === 'SMART' && <span>使用 {usageByKey.get(item.key)?.useCount || 0} 次</span>}
                      </span>
                    </button>
                    <AppButton variant="ghost" size="icon" disabled={saving} onClick={() => onToggleFavorite(item.key)} aria-label={`${favorite ? '取消收藏' : '收藏'}${item.label}`} aria-pressed={favorite} title={favorite ? '取消收藏' : '收藏到首页'} className={favorite ? '!text-amber-600 hover:!text-amber-700' : ''}>
                      <Star aria-hidden="true" className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />
                    </AppButton>
                  </div>
                  {renderActions?.(item)}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
