'use client'

import { useMemo, useState, type DragEvent } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import { defaultWorkspaceLayout, maxWorkspaceShortcuts, rankWorkspaceFunctionKeys } from '@/lib/workspace'
import type { WorkspaceFunctionKey, WorkspaceMode, WorkspacePreferenceValue } from '@/lib/workspace'
import {
  groupWorkspaceFunctions, useWorkspaceFunctionSearch, useWorkspacePreferenceActions,
  WorkspaceFunctionGroups, WorkspaceFunctionSearch,
  type SaveWorkspacePreference, type WorkspaceFunctionItem,
} from './WorkspaceFunctionCatalog'

export type { WorkspaceFunctionItem } from './WorkspaceFunctionCatalog'

const modeOptions: Array<{ key: WorkspaceMode; label: string; description: string }> = [
  { key: 'DEFAULT', label: '系统默认', description: '使用系统预置的常用顺序' },
  { key: 'SMART', label: '智能排序', description: '按个人使用次数和最近使用排序' },
  { key: 'CUSTOM', label: '自定义', description: '自行选择并摆放快捷入口' },
]

export function WorkspaceLauncher({ items, preference, onOpen, onOpenAllFunctions, onSave, preferenceBusy = false, title, mobileContentSearch = false }: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
  title?: string
  mobileContentSearch?: boolean
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draggedKey, setDraggedKey] = useState<WorkspaceFunctionKey | null>(null)
  const [draftLayout, setDraftLayout] = useState<WorkspaceFunctionKey[]>(preference.layout)
  const [draftPinned, setDraftPinned] = useState<WorkspaceFunctionKey[]>(preference.pinned)
  const { saving, error, savePreference, toggleFavorite } = useWorkspacePreferenceActions(preference, onSave, preferenceBusy)
  const search = useWorkspaceFunctionSearch(items)
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items])
  const availableKeys = items.map((item) => item.key)
  const displayedKeys = rankWorkspaceFunctionKeys({ ...preference, availableKeys })
  const displayedItems = displayedKeys.flatMap((key) => {
    const item = itemByKey.get(key)
    return item && !preference.pinned.includes(key) ? [item] : []
  })
  const favoriteItems = preference.pinned.flatMap((key) => {
    const item = itemByKey.get(key)
    return item ? [item] : []
  })
  const groups = groupWorkspaceFunctions(items)
  const visibleDraftCount = draftLayout.filter((key) => availableKeys.includes(key)).length

  const groupShortcutKeys = (item: WorkspaceFunctionItem) => displayedItems
    .filter((candidate) => candidate.groupKey === item.groupKey)
    .map((candidate) => candidate.key)

  const changeMode = async (mode: WorkspaceMode) => {
    const layout = mode === 'CUSTOM' && preference.layout.length === 0 ? displayedKeys : preference.layout
    await savePreference({ mode, layout, pinned: preference.pinned })
  }
  const openSettings = () => {
    setDraftLayout(preference.layout.length > 0 ? preference.layout : displayedKeys)
    setDraftPinned(preference.pinned)
    setSettingsOpen(true)
  }
  const reorderShortcut = async (key: WorkspaceFunctionKey, targetKey: WorkspaceFunctionKey) => {
    const item = itemByKey.get(key)
    if (!item) return
    const groupKeys = groupShortcutKeys(item)
    const from = groupKeys.indexOf(key)
    const to = groupKeys.indexOf(targetKey)
    if (from < 0 || to < 0 || from === to) return
    const [moved] = groupKeys.splice(from, 1)
    groupKeys.splice(to, 0, moved)
    const groupSet = new Set(groupKeys)
    let nextIndex = 0
    const layoutKeys = [...preference.layout, ...displayedKeys.filter((current) => !preference.layout.includes(current))]
    const layout = layoutKeys.map((current) => groupSet.has(current) ? groupKeys[nextIndex++] : current)
    await savePreference({ mode: 'CUSTOM', layout, pinned: preference.pinned })
  }
  const moveShortcut = async (item: WorkspaceFunctionItem, direction: -1 | 1) => {
    const groupKeys = groupShortcutKeys(item)
    const targetKey = groupKeys[groupKeys.indexOf(item.key) + direction]
    if (targetKey) await reorderShortcut(item.key, targetKey)
  }
  const removeShortcut = async (key: WorkspaceFunctionKey) => {
    if (displayedKeys.length <= 1) return
    const layoutKeys = [...preference.layout, ...displayedKeys.filter((item) => !preference.layout.includes(item))]
    await savePreference({ mode: 'CUSTOM', layout: layoutKeys.filter((item) => item !== key), pinned: preference.pinned })
  }
  const dropShortcut = async (targetKey: WorkspaceFunctionKey) => {
    if (!draggedKey || draggedKey === targetKey || preference.mode !== 'CUSTOM') return
    await reorderShortcut(draggedKey, targetKey)
    setDraggedKey(null)
  }
  const toggleDraftLayout = (key: WorkspaceFunctionKey) => {
    setDraftLayout((current) => {
      const visibleCount = current.filter((item) => availableKeys.includes(item)).length
      if (current.includes(key)) return visibleCount > 1 ? current.filter((item) => item !== key) : current
      return visibleCount >= maxWorkspaceShortcuts ? current : [...current, key]
    })
  }
  const toggleDraftPin = (key: WorkspaceFunctionKey) => {
    setDraftPinned((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }
  const saveDraft = async () => {
    const saved = await savePreference({ mode: preference.mode, layout: preference.mode === 'CUSTOM' ? draftLayout : preference.layout, pinned: draftPinned })
    if (saved) setSettingsOpen(false)
  }
  const restoreDefault = async () => {
    const saved = await savePreference({ mode: 'DEFAULT', layout: defaultWorkspaceLayout, pinned: preference.pinned })
    if (saved) setSettingsOpen(false)
  }
  const renderCustomActions = (item: WorkspaceFunctionItem) => {
    const groupKeys = groupShortcutKeys(item)
    const index = groupKeys.indexOf(item.key)
    if (preference.mode !== 'CUSTOM' || index < 0) return null
    return (
      <div className="mt-2 flex justify-end gap-1 border-t border-gray-200 pt-2">
        <AppButton variant="ghost" size="sm" disabled={index === 0 || saving} onClick={() => moveShortcut(item, -1)} aria-label={`${item.label}上移`}>↑</AppButton>
        <AppButton variant="ghost" size="sm" disabled={index === groupKeys.length - 1 || saving} onClick={() => moveShortcut(item, 1)} aria-label={`${item.label}下移`}>↓</AppButton>
        <AppButton variant="ghost" size="sm" disabled={displayedKeys.length <= 1 || saving} onClick={() => removeShortcut(item.key)} aria-label={`从常用入口移除${item.label}`}>移除</AppButton>
      </div>
    )
  }
  const catalogProps = {
    preference, saving, onOpen, onToggleFavorite: toggleFavorite,
    renderActions: renderCustomActions,
    getDragProps: (item: WorkspaceFunctionItem) => ({
      draggable: !saving && preference.mode === 'CUSTOM' && displayedKeys.includes(item.key),
      onDragStart: () => setDraggedKey(item.key),
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!saving && preference.mode === 'CUSTOM' && draggedKey && groupShortcutKeys(item).includes(draggedKey)) event.preventDefault()
      },
      onDrop: () => dropShortcut(item.key),
      onDragEnd: () => setDraggedKey(null),
    }),
  }

  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title ? <h1 className="text-xl font-semibold text-gray-900">{title}</h1> : <h2 className="text-base font-semibold text-gray-900">常用功能</h2>}
        <AppButton variant="secondary" size="sm" onClick={onOpenAllFunctions}>全部功能</AppButton>
      </div>
      <WorkspaceFunctionSearch search={search} storageKey="mes-lite.searchPresets.workspace" mobileContentSearch={mobileContentSearch} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {search.searching ? (
        <section aria-label="功能搜索结果" className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">搜索结果 <span className="text-sm font-normal text-gray-500">{search.visibleItems.length} 项</span></h2>
          {search.visibleItems.length > 0 ? <WorkspaceFunctionGroups items={search.visibleItems} preference={preference} saving={saving} onOpen={onOpen} onToggleFavorite={toggleFavorite} /> : <p className="py-8 text-center text-sm text-gray-500">没有匹配的功能，试试其他名称、分组或说明。</p>}
        </section>
      ) : (
        <>
          <section aria-label="我的收藏" className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">我的收藏 <span className="text-sm font-normal text-gray-500">{favoriteItems.length} 项</span></h2>
            {favoriteItems.length > 0 ? <WorkspaceFunctionGroups items={favoriteItems} preference={preference} saving={saving} onOpen={onOpen} onToggleFavorite={toggleFavorite} /> : <p className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">点击功能旁的星标，即可收藏到这里。</p>}
          </section>
          <section aria-label="常用功能" className="space-y-4 border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">快捷入口</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1" aria-label="常用功能排序方式">
                  {modeOptions.map((option) => <AppButton key={option.key} variant={preference.mode === option.key ? 'primary' : 'ghost'} size="sm" title={option.description} disabled={saving} onClick={() => changeMode(option.key)} aria-pressed={preference.mode === option.key}>{option.label}</AppButton>)}
                </div>
                {preference.mode !== 'DEFAULT' && <AppButton variant="secondary" size="sm" onClick={openSettings} disabled={saving}>管理快捷入口</AppButton>}
              </div>
            </div>
            {displayedItems.length > 0 ? <WorkspaceFunctionGroups items={displayedItems} {...catalogProps} /> : <p className="text-sm text-gray-500">{items.length > 0 ? '当前常用入口已显示在我的收藏中。' : '当前账号暂无可用功能。'}</p>}
          </section>
        </>
      )}
      {settingsOpen && (
        <ModalDialog
          title="管理工作台快捷入口"
          description={preference.mode === 'CUSTOM' ? `选择 1–${maxWorkspaceShortcuts} 个常用功能，收藏项显示在上方，其余入口可在同一业务分组内拖动排序。` : '智能排序会自动学习使用次数，收藏项始终显示在首页。'}
          onClose={() => setSettingsOpen(false)}
          size="lg"
          footer={<><AppButton variant="secondary" onClick={restoreDefault} disabled={saving}>恢复系统默认</AppButton><AppButton variant="secondary" onClick={() => setSettingsOpen(false)} disabled={saving}>取消</AppButton><AppButton variant="primary" onClick={saveDraft} disabled={saving}>保存</AppButton></>}
        >
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key}>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">{group.label}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const selected = preference.mode === 'CUSTOM' ? draftLayout.includes(item.key) : draftPinned.includes(item.key)
                    return (
                      <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3">
                        <input type="checkbox" checked={selected} disabled={saving || (preference.mode === 'CUSTOM' && !selected && visibleDraftCount >= maxWorkspaceShortcuts)} onChange={() => preference.mode === 'CUSTOM' ? toggleDraftLayout(item.key) : toggleDraftPin(item.key)} aria-label={`${preference.mode === 'CUSTOM' ? '显示' : '收藏'}${item.label}`} />
                        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-800">{item.label}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{item.description}</span></span>
                      </label>
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

export function AllFunctionsPage({ items, preference, onOpen, onSave, preferenceBusy = false }: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
}) {
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const search = useWorkspaceFunctionSearch(items)
  const { saving, error, toggleFavorite } = useWorkspacePreferenceActions(preference, onSave, preferenceBusy)
  const visibleItems = favoritesOnly ? search.visibleItems.filter((item) => preference.pinned.includes(item.key)) : search.visibleItems
  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-semibold text-gray-900">全部功能</h1><p className="mt-1 text-sm text-gray-500">按业务分组浏览当前可用入口，收藏后可从首页打开。</p></div>
        <AppButton variant={favoritesOnly ? 'primary' : 'secondary'} size="sm" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((current) => !current)}>只看收藏</AppButton>
      </div>
      <WorkspaceFunctionSearch search={search} storageKey="mes-lite.searchPresets.allFunctions" mobileContentSearch />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p role="status" className="text-xs text-gray-500">{visibleItems.length} 个功能</p>
      {visibleItems.length > 0 ? <WorkspaceFunctionGroups items={visibleItems} preference={preference} saving={saving} onOpen={onOpen} onToggleFavorite={toggleFavorite} /> : <p className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">{favoritesOnly ? '没有匹配的收藏，可切换到全部功能添加。' : '没有匹配的功能，试试其他名称、分组或说明。'}</p>}
    </section>
  )
}
