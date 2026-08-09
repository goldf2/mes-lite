'use client'

import { useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import {
  defaultWorkspaceLayout,
  maxWorkspaceShortcuts,
  rankWorkspaceFunctionKeys,
} from '@/lib/workspace'
import type { WorkspaceFunctionKey, WorkspaceMode, WorkspacePreferenceValue } from '@/lib/workspace'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { filterByAdvancedSearch, matchesKeywordValues } from '@/lib/resource-search'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'

export interface WorkspaceFunctionItem {
  key: WorkspaceFunctionKey
  label: string
  groupKey: string
  groupLabel: string
  description: string
  icon: string
}

const functionAdvancedSearchFields: readonly ResourceAdvancedSearchField<WorkspaceFunctionItem>[] = [
  { key: 'label', label: '功能名称', type: 'text', read: (item) => item.label },
  { key: 'group', label: '业务分组', type: 'text', read: (item) => item.groupLabel },
  { key: 'description', label: '功能说明', type: 'text', read: (item) => item.description },
]

const modeOptions: Array<{ key: WorkspaceMode; label: string; description: string }> = [
  { key: 'DEFAULT', label: '系统默认', description: '使用系统预置的常用顺序' },
  { key: 'SMART', label: '智能排序', description: '按个人使用次数和最近使用排序' },
  { key: 'CUSTOM', label: '自定义', description: '自行选择并摆放快捷入口' },
]

function groupItems(items: WorkspaceFunctionItem[]) {
  const groups = new Map<string, { key: string; label: string; items: WorkspaceFunctionItem[] }>()
  for (const item of items) {
    const group = groups.get(item.groupKey) || { key: item.groupKey, label: item.groupLabel, items: [] }
    group.items.push(item)
    groups.set(item.groupKey, group)
  }
  return Array.from(groups.values())
}

export function WorkspaceLauncher({
  items,
  preference,
  onOpen,
  onOpenAllFunctions,
  onSave,
}: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: (preference: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draggedKey, setDraggedKey] = useState<WorkspaceFunctionKey | null>(null)
  const [draftLayout, setDraftLayout] = useState<WorkspaceFunctionKey[]>(preference.layout)
  const [draftPinned, setDraftPinned] = useState<WorkspaceFunctionKey[]>(preference.pinned)
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items])
  const availableKeys = items.map((item) => item.key)
  const displayedKeys = rankWorkspaceFunctionKeys({ ...preference, availableKeys })
  const displayedItems = displayedKeys.map((key) => itemByKey.get(key)).filter(Boolean) as WorkspaceFunctionItem[]
  const usageByKey = new Map(preference.usage.map((item) => [item.functionKey, item]))
  const groups = groupItems(items)

  const savePreference = async (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => {
    setSaving(true)
    try {
      await onSave(next)
      return true
    } catch {
      return false
    } finally {
      setSaving(false)
    }
  }

  const changeMode = async (mode: WorkspaceMode) => {
    const layout = mode === 'CUSTOM' && preference.layout.length === 0
      ? displayedKeys
      : preference.layout
    await savePreference({ mode, layout, pinned: preference.pinned })
  }

  const openSettings = () => {
    setDraftLayout(preference.layout.length > 0 ? preference.layout : displayedKeys)
    setDraftPinned(preference.pinned)
    setSettingsOpen(true)
  }

  const moveShortcut = async (key: WorkspaceFunctionKey, direction: -1 | 1) => {
    const current = [...displayedKeys]
    const index = current.indexOf(key)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return
    const [item] = current.splice(index, 1)
    current.splice(nextIndex, 0, item)
    await savePreference({ mode: 'CUSTOM', layout: current, pinned: preference.pinned })
  }

  const removeShortcut = async (key: WorkspaceFunctionKey) => {
    const next = displayedKeys.filter((item) => item !== key)
    if (next.length === 0) return
    await savePreference({ mode: 'CUSTOM', layout: next, pinned: preference.pinned.filter((item) => item !== key) })
  }

  const togglePin = async (key: WorkspaceFunctionKey) => {
    const pinned = preference.pinned.includes(key)
      ? preference.pinned.filter((item) => item !== key)
      : [...preference.pinned, key]
    await savePreference({ mode: preference.mode, layout: preference.layout, pinned })
  }

  const dropShortcut = async (targetKey: WorkspaceFunctionKey) => {
    if (!draggedKey || draggedKey === targetKey || preference.mode !== 'CUSTOM') return
    const next = [...displayedKeys]
    const from = next.indexOf(draggedKey)
    const to = next.indexOf(targetKey)
    if (from < 0 || to < 0) return
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setDraggedKey(null)
    await savePreference({ mode: 'CUSTOM', layout: next, pinned: preference.pinned })
  }

  const toggleDraftLayout = (key: WorkspaceFunctionKey) => {
    setDraftLayout((current) => {
      if (current.includes(key)) return current.length > 1 ? current.filter((item) => item !== key) : current
      if (current.length >= maxWorkspaceShortcuts) return current
      return [...current, key]
    })
  }

  const toggleDraftPin = (key: WorkspaceFunctionKey) => {
    setDraftPinned((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  const saveDraft = async () => {
    const saved = await savePreference({
      mode: preference.mode,
      layout: draftLayout,
      pinned: draftPinned.filter((key) => availableKeys.includes(key)),
    })
    if (saved) setSettingsOpen(false)
  }

  const restoreDefault = async () => {
    const saved = await savePreference({ mode: 'DEFAULT', layout: defaultWorkspaceLayout, pinned: [] })
    if (saved) setSettingsOpen(false)
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900">常用功能</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {modeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                title={option.description}
                disabled={saving}
                onClick={() => changeMode(option.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  preference.mode === option.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {preference.mode !== 'DEFAULT' && (
            <AppButton variant="secondary" size="sm" onClick={openSettings} disabled={saving}>
              管理快捷入口
            </AppButton>
          )}
          <AppButton variant="secondary" size="sm" onClick={onOpenAllFunctions}>
            所有功能
          </AppButton>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8 min-[2000px]:grid-cols-10">
        {displayedItems.map((item, index) => {
          const usage = usageByKey.get(item.key)
          const pinned = preference.pinned.includes(item.key)
          return (
            <div
              key={item.key}
              draggable={preference.mode === 'CUSTOM'}
              onDragStart={() => setDraggedKey(item.key)}
              onDragOver={(event) => {
                if (preference.mode === 'CUSTOM') event.preventDefault()
              }}
              onDrop={() => dropShortcut(item.key)}
              onDragEnd={() => setDraggedKey(null)}
              className={`group rounded-lg border bg-gray-50/70 p-2.5 transition hover:border-blue-300 hover:bg-blue-50/50 ${
                draggedKey === item.key ? 'opacity-50' : 'border-gray-200'
              } ${preference.mode === 'CUSTOM' ? 'cursor-grab' : ''}`}
            >
              <button type="button" onClick={() => onOpen(item.key)} className="w-full text-left">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-semibold text-blue-700">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{item.label}</span>
                  {preference.mode === 'SMART' && pinned && <span className="shrink-0 text-[11px] font-medium text-blue-600">固定</span>}
                </div>
                <div className="mt-1.5 truncate text-xs leading-4 text-gray-500" title={item.description}>{item.description}</div>
              </button>
              {preference.mode === 'CUSTOM' && (
                <div className="mt-1.5 flex items-center justify-end gap-1 border-t border-gray-200 pt-1.5">
                  <button type="button" disabled={index === 0 || saving} onClick={() => moveShortcut(item.key, -1)} className="h-6 rounded px-1.5 text-xs text-gray-500 hover:bg-white disabled:opacity-30" aria-label={`${item.label}上移`}>↑</button>
                  <button type="button" disabled={index === displayedItems.length - 1 || saving} onClick={() => moveShortcut(item.key, 1)} className="h-6 rounded px-1.5 text-xs text-gray-500 hover:bg-white disabled:opacity-30" aria-label={`${item.label}下移`}>↓</button>
                  <button type="button" disabled={displayedItems.length <= 1 || saving} onClick={() => removeShortcut(item.key)} className="h-6 rounded px-1.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-30">移除</button>
                </div>
              )}
              {preference.mode === 'SMART' && (
                <div className="mt-1.5 flex items-center justify-between border-t border-gray-200 pt-1.5">
                  <span className="text-[11px] text-gray-400">使用 {usage?.useCount || 0} 次</span>
                  <button type="button" disabled={saving} onClick={() => togglePin(item.key)} className="rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-white">
                    {pinned ? '取消固定' : '固定在前'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {settingsOpen && (
        <ModalDialog
          title="管理工作台快捷入口"
          description={preference.mode === 'CUSTOM' ? `选择 1–${maxWorkspaceShortcuts} 个功能，保存后可在工作台拖动排序。` : '智能排序会自动学习使用次数，固定项始终排在前面。'}
          onClose={() => setSettingsOpen(false)}
          size="lg"
          footer={(
            <>
              <AppButton variant="secondary" onClick={restoreDefault} disabled={saving}>恢复系统默认</AppButton>
              <AppButton variant="secondary" onClick={() => setSettingsOpen(false)} disabled={saving}>取消</AppButton>
              <AppButton variant="primary" onClick={saveDraft} disabled={saving}>保存</AppButton>
            </>
          )}
        >
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key}>
                <h4 className="mb-2 text-sm font-semibold text-gray-900">{group.label}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const selected = draftLayout.includes(item.key)
                    const pinned = draftPinned.includes(item.key)
                    return (
                      <div key={item.key} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                        {preference.mode === 'CUSTOM' ? (
                          <input type="checkbox" checked={selected} onChange={() => toggleDraftLayout(item.key)} aria-label={`显示${item.label}`} />
                        ) : (
                          <input type="checkbox" checked={pinned} onChange={() => toggleDraftPin(item.key)} aria-label={`固定${item.label}`} />
                        )}
                        <button type="button" onClick={() => preference.mode === 'CUSTOM' ? toggleDraftLayout(item.key) : toggleDraftPin(item.key)} className="min-w-0 flex-1 text-left">
                          <div className="text-sm font-medium text-gray-800">{item.label}</div>
                          <div className="mt-0.5 truncate text-xs text-gray-500">{item.description}</div>
                        </button>
                        {preference.mode === 'SMART' && pinned && <span className="text-xs text-blue-600">固定</span>}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </ModalDialog>
      )}
    </section>
  )
}

export function AllFunctionsPage({
  items,
  preference,
  onOpen,
}: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const usageByKey = new Map(preference.usage.map((item) => [item.functionKey, item]))
  const advancedItems = filterByAdvancedSearch(items, functionAdvancedSearchFields, searchConditions)
  const visibleItems = keyword.trim()
    ? advancedItems.filter((item) => matchesKeywordValues(keyword, [item.label, item.groupLabel, item.description]))
    : advancedItems
  const groups = groupItems(visibleItems)

  return (
    <div className="space-y-5">
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.allFunctions"
              value={keyword}
              onChange={setKeyword}
              placeholder="输入功能名称或业务分组"
              conditions={searchConditions}
              onConditionsChange={setSearchConditions}
              conditionLabel="所有功能精确搜索"
            />
          )}
          advancedSearch={<ResourceAdvancedSearch fields={functionAdvancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
        />
      </TopBarPortal>
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-gray-900">所有功能</h2>
        <p className="mt-1 text-sm text-gray-500">按一级业务入口分组，只显示当前账号有权限的页面。</p>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">没有匹配的功能</div>
      ) : groups.map((group) => (
        <section key={group.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold text-gray-900">{group.label}</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onOpen(item.key)}
                className="flex min-h-24 items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-gray-500">{item.description}</span>
                  <span className="mt-2 block text-[11px] text-gray-400">使用 {usageByKey.get(item.key)?.useCount || 0} 次</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
