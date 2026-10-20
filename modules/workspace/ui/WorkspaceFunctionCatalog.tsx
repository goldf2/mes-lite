'use client'

import { useCallback, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { ExternalLink, Search, Star } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import useCompactViewport from '@/app/components/useCompactViewport'
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
  const resetSearch = useCallback(() => {
    setKeyword('')
    setConditions([])
  }, [])
  return {
    keyword, setKeyword, conditions, setConditions, resetSearch,
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

export function WorkspaceFunctionSearch({ search, storageKey, mobileContentSearch = false }: {
  search: ReturnType<typeof useWorkspaceFunctionSearch>
  storageKey: string
  mobileContentSearch?: boolean
}) {
  const compactViewport = useCompactViewport(1023)
  const inlineSearch = mobileContentSearch && compactViewport
  const inlineSearchRef = useRef<HTMLDivElement>(null)
  const keywordSearch = (
    <SearchFieldWithPresets
      storageKey={storageKey}
      value={search.keyword}
      onChange={search.setKeyword}
      placeholder="搜索功能名称、分组或说明"
      conditions={search.conditions}
      onConditionsChange={search.setConditions}
      conditionLabel="功能精确搜索"
      className={inlineSearch ? 'flex w-full min-w-0 max-w-none items-center gap-2' : undefined}
    />
  )
  const focusInlineSearch = () => {
    inlineSearchRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true })
    inlineSearchRef.current?.scrollIntoView({ block: 'center' })
  }
  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={inlineSearch ? (
            <AppButton variant="ghost" size="icon" onClick={focusInlineSearch} aria-label="定位功能搜索"><Search aria-hidden="true" className="h-4 w-4" /></AppButton>
          ) : keywordSearch}
          advancedSearch={<ResourceAdvancedSearch fields={functionAdvancedSearchFields} conditions={search.conditions} onChange={search.setConditions} />}
        />
      </TopBarPortal>
      {inlineSearch && <div ref={inlineSearchRef} role="search" aria-label="功能目录搜索" className="w-full min-w-0">{keywordSearch}</div>}
    </>
  )
}

export function WorkspaceFunctionCardGrid({
  items,
  preference,
  saving,
  onOpen,
  onToggleFavorite,
  compact = false,
  showDescription = true,
  columnsClassName,
  renderActions,
  getDragProps,
}: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  saving: boolean
  onOpen: (key: WorkspaceFunctionKey) => void
  onToggleFavorite: (key: WorkspaceFunctionKey) => void
  compact?: boolean
  showDescription?: boolean
  columnsClassName?: string
  renderActions?: (item: WorkspaceFunctionItem) => ReactNode
  getDragProps?: (item: WorkspaceFunctionItem) => HTMLAttributes<HTMLDivElement>
}) {
  const usageByKey = new Map(preference.usage.map((item) => [item.functionKey, item]))
  const gridClassName = columnsClassName || (compact
    ? 'grid grid-cols-1 gap-1.5 sm:grid-cols-2'
    : 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')

  return (
    <div className={gridClassName}>
      {items.map((item) => {
        const favorite = preference.pinned.includes(item.key)
        return (
          <div
            key={item.key}
            {...getDragProps?.(item)}
            title={`${item.label}：${item.description}`}
            className={`group rounded-lg border border-gray-200/80 bg-gray-50/70 transition hover:border-blue-300 hover:bg-blue-50/50 ${
              compact ? 'px-2.5 py-1.5' : 'p-3'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(item.key)}
                aria-label={`打开${item.label}`}
                className="min-h-10 min-w-10 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex shrink-0 items-center justify-center rounded-md font-semibold ${
                      item.externalHref
                        ? 'bg-emerald-100/80 text-emerald-700'
                        : 'bg-blue-100/75 text-blue-700'
                    } ${compact ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm'}`}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 break-words whitespace-normal text-xs font-medium leading-5 text-gray-800 group-hover:font-semibold group-hover:text-blue-700 sm:text-sm">
                    {item.label}
                  </span>
                  {item.externalHref && <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0 text-gray-400" />}
                </span>
                {showDescription && (
                  <span
                    className={`${compact ? 'mt-1 line-clamp-1 pl-8' : 'mt-2 line-clamp-2'} block text-xs leading-5 text-gray-500`}
                  >
                    {item.description}
                  </span>
                )}
                {(!compact || preference.mode === 'SMART') && (
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                    <span>{item.sourceLabel || 'MES Lite'}</span>
                    {preference.mode === 'SMART' && <span>使用 {usageByKey.get(item.key)?.useCount || 0} 次</span>}
                  </span>
                )}
              </button>
              <AppButton
                variant="ghost"
                size="icon"
                disabled={saving}
                onClick={() => onToggleFavorite(item.key)}
                aria-label={`${favorite ? '取消收藏' : '收藏'}${item.label}`}
                aria-pressed={favorite}
                title={favorite ? '取消收藏' : '收藏到首页'}
                className={`${compact ? '!h-10 !w-10 !shrink-0' : ''} ${
                  favorite ? '!text-amber-500 hover:!text-amber-600' : '!text-gray-300 group-hover:!text-gray-400'
                }`}
              >
                <Star aria-hidden="true" className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
              </AppButton>
            </div>
            {renderActions?.(item)}
          </div>
        )
      })}
    </div>
  )
}

export function WorkspaceFunctionGroups({ items, preference, saving, onOpen, onToggleFavorite, compact = false, renderActions, getDragProps }: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  saving: boolean
  onOpen: (key: WorkspaceFunctionKey) => void
  onToggleFavorite: (key: WorkspaceFunctionKey) => void
  compact?: boolean
  renderActions?: (item: WorkspaceFunctionItem) => ReactNode
  getDragProps?: (item: WorkspaceFunctionItem) => HTMLAttributes<HTMLDivElement>
}) {
  return (
    <div className="space-y-5">
      {groupWorkspaceFunctions(items).map((group) => (
        <section key={group.key} aria-label={`${group.label}功能`}>
          <h3 className="mb-2 text-sm font-semibold text-gray-600">{group.label}</h3>
          <WorkspaceFunctionCardGrid
            items={group.items}
            preference={preference}
            saving={saving}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            compact={compact}
            showDescription
            columnsClassName={compact ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : undefined}
            renderActions={renderActions}
            getDragProps={getDragProps}
          />
        </section>
      ))}
    </div>
  )
}
