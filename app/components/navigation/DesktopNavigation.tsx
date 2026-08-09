'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import type { NavigationGroup, NavigationItem } from './NavigationModel'

export type DesktopNavigationMode = 'accordion' | 'split'
export type DesktopNavigationDisplayMode = 'icon' | 'icon-label' | 'label'

const primaryRailStorageKey = 'mes-lite.layout.desktopPrimaryRailWidth'
const primaryRailWidthConfig: Record<DesktopNavigationDisplayMode, { defaultWidth: number; minWidth: number; maxWidth: number }> = {
  icon: { defaultWidth: 64, minWidth: 56, maxWidth: 96 },
  'icon-label': { defaultWidth: 136, minWidth: 120, maxWidth: 184 },
  label: { defaultWidth: 112, minWidth: 88, maxWidth: 168 },
}

function clampPrimaryRailWidth(width: number, displayMode: DesktopNavigationDisplayMode) {
  const config = primaryRailWidthConfig[displayMode]
  return Math.min(config.maxWidth, Math.max(config.minWidth, width))
}

function NavigationItemButton({ item, showIcon = false }: { item: NavigationItem; showIcon?: boolean }) {
  return (
    <button
      type="button"
      draggable={item.draggable}
      aria-current={item.active ? 'page' : undefined}
      onClick={item.onClick}
      onDragStart={item.onDragStart}
      onDragOver={item.onDragOver}
      onDragLeave={item.onDragLeave}
      onDrop={item.onDrop}
      className={`flex min-h-[32px] w-full items-center justify-between gap-2 rounded-md px-2.5 py-1 text-left text-sm transition ${
        item.dragState === 'dragging' ? 'opacity-50' : item.dragState === 'target' ? 'ring-2 ring-blue-300' : ''
      } ${item.active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {showIcon && item.icon}
        <span className="truncate">{item.label}</span>
      </span>
      {item.draggable && <span aria-hidden="true" className="shrink-0 text-xs text-gray-300">⋮⋮</span>}
    </button>
  )
}

function NavigationSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative px-2 py-2">
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onChange('')
        }}
        aria-label="搜索功能菜单"
        placeholder="搜索功能"
        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
      />
      {value && (
        <button
          type="button"
          aria-label="清空功能搜索"
          onClick={() => onChange('')}
          className="absolute right-3.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function NavigationSearchResults({ groups }: { groups: NavigationGroup[] }) {
  if (groups.length === 0) {
    return <div className="px-3 py-8 text-center text-sm text-gray-500" role="status">没有匹配的功能</div>
  }

  return (
    <div className="space-y-3 py-1">
      {groups.map((group) => (
        <section key={group.id} aria-label={`${group.label}搜索结果`}>
          <div className="px-2.5 pb-1 text-[11px] font-semibold text-gray-400">{group.label}</div>
          <div className="space-y-0.5">
            {group.items.map((item) => <NavigationItemButton key={`${group.id}:${item.id}`} item={item} showIcon={Boolean(item.icon)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function AccordionNavigation({
  groups,
  query,
  onQueryChange,
  displayMode,
}: {
  groups: NavigationGroup[]
  query: string
  onQueryChange: (value: string) => void
  displayMode: DesktopNavigationDisplayMode
}) {
  return (
    <nav aria-label="一级与二级功能菜单" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NavigationSearch value={query} onChange={onQueryChange} />
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-1.5 pb-1">
        {query ? <NavigationSearchResults groups={groups} /> : groups.map((group, index) => (
          <div key={group.id} className={index === groups.length - 1 && group.id === 'account' ? 'border-t border-gray-100 pt-1' : ''}>
            <button
              type="button"
              aria-expanded={group.active}
              aria-label={group.label}
              title={displayMode === 'icon' ? group.label : undefined}
              onClick={group.onClick}
              className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1 text-sm font-semibold transition ${
                group.active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {displayMode !== 'label' && group.icon}
                {displayMode !== 'icon' && <span className="truncate">{group.label}</span>}
              </span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${group.active ? 'rotate-180' : '-rotate-90'}`} />
            </button>
            {group.active && (
              <div className="ml-4 space-y-0 border-l border-gray-200 pl-2">
                {group.items.map((item) => <NavigationItemButton key={item.id} item={item} showIcon={Boolean(item.icon)} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}

function SplitNavigation({
  groups,
  searchGroups,
  query,
  onQueryChange,
  primaryRailWidth,
  resizingPrimaryRail,
  onPrimaryRailResizeStart,
  onPrimaryRailResizeReset,
  onPrimaryRailResizeBy,
  displayMode,
}: {
  groups: NavigationGroup[]
  searchGroups: NavigationGroup[]
  query: string
  onQueryChange: (value: string) => void
  primaryRailWidth: number
  resizingPrimaryRail: boolean
  onPrimaryRailResizeStart: () => void
  onPrimaryRailResizeReset: () => void
  onPrimaryRailResizeBy: (delta: number) => void
  displayMode: DesktopNavigationDisplayMode
}) {
  const activeGroup = groups.find((group) => group.active) || groups[0]
  const railWidth = primaryRailWidthConfig[displayMode]

  return (
    <nav aria-label="双列一级与二级功能菜单" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-200 bg-white">
        <NavigationSearch value={query} onChange={onQueryChange} />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div style={{ width: primaryRailWidth }} className="shrink-0 overflow-y-auto bg-slate-50 px-1.5 py-2">
          <div className="space-y-1">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-current={group.active ? 'true' : undefined}
                aria-label={group.label}
                title={displayMode === 'icon' ? group.label : undefined}
                onClick={group.onClick}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold leading-none transition ${
                  displayMode === 'icon' ? 'justify-center' : 'justify-start'
                } ${
                  group.active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                {displayMode !== 'label' && group.icon}
                {displayMode !== 'icon' && <span className="min-w-0 truncate">{group.label}</span>}
              </button>
            ))}
          </div>
        </div>
        <div
          role="separator"
          aria-label="调整一级菜单列宽度"
          aria-orientation="vertical"
          aria-valuemin={railWidth.minWidth}
          aria-valuemax={railWidth.maxWidth}
          aria-valuenow={Math.round(primaryRailWidth)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            onPrimaryRailResizeStart()
          }}
          onDoubleClick={onPrimaryRailResizeReset}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            onPrimaryRailResizeBy(event.key === 'ArrowRight' ? 4 : -4)
          }}
          title="拖动调整一级菜单宽度，双击恢复默认"
          className={`group relative z-10 flex w-2 shrink-0 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center border-l border-gray-200 outline-none ${
            resizingPrimaryRail ? 'bg-blue-50/80' : ''
          }`}
        >
          <span className={`h-14 w-0.5 rounded-full transition ${
            resizingPrimaryRail
              ? 'bg-blue-500'
              : 'bg-transparent group-hover:bg-blue-400 group-focus:bg-blue-500'
          }`} />
        </div>
        <div
          aria-label={query ? '功能搜索结果' : `${activeGroup?.label || '当前分类'}二级菜单`}
          className="min-w-0 flex-1 overflow-y-auto bg-white px-2 py-2"
        >
          {query ? (
            <NavigationSearchResults groups={searchGroups} />
          ) : (
            <div className="space-y-0.5">
              {activeGroup?.items.map((item) => <NavigationItemButton key={item.id} item={item} showIcon={Boolean(item.icon)} />)}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

export default function DesktopNavigation({
  mode,
  groups,
  displayMode,
}: {
  mode: DesktopNavigationMode
  groups: NavigationGroup[]
  displayMode: DesktopNavigationDisplayMode
}) {
  const [query, setQuery] = useState('')
  const [primaryRailWidth, setPrimaryRailWidth] = useState(primaryRailWidthConfig[displayMode].defaultWidth)
  const [primaryRailReady, setPrimaryRailReady] = useState(false)
  const [resizingPrimaryRail, setResizingPrimaryRail] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups
    return groups
      .map((group) => {
        const groupMatches = group.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
        const items = (groupMatches ? group.items : group.items.filter((item) => (
          item.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
        ))).map((item) => ({ ...item, draggable: false }))
        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [groups, normalizedQuery])

  useEffect(() => {
    const displayStorageKey = `${primaryRailStorageKey}.${displayMode}`
    const savedValue = window.localStorage.getItem(displayStorageKey)
      ?? (displayMode === 'icon-label' ? window.localStorage.getItem(primaryRailStorageKey) : null)
    const savedWidth = Number(savedValue)
    setPrimaryRailWidth(Number.isFinite(savedWidth) && savedValue !== null
      ? clampPrimaryRailWidth(savedWidth, displayMode)
      : primaryRailWidthConfig[displayMode].defaultWidth)
    setPrimaryRailReady(true)
  }, [displayMode])

  useEffect(() => {
    if (!primaryRailReady) return
    window.localStorage.setItem(`${primaryRailStorageKey}.${displayMode}`, String(primaryRailWidth))
  }, [displayMode, primaryRailReady, primaryRailWidth])

  useEffect(() => {
    if (!resizingPrimaryRail) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const resize = (event: PointerEvent) => {
      setPrimaryRailWidth(clampPrimaryRailWidth(event.clientX, displayMode))
    }
    const stop = () => setResizingPrimaryRail(false)

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
    }
  }, [displayMode, resizingPrimaryRail])

  if (mode === 'accordion') {
    return <AccordionNavigation groups={filteredGroups} query={normalizedQuery ? query : ''} onQueryChange={setQuery} displayMode={displayMode} />
  }

  return (
    <>
      <div className="contents xl:hidden"><AccordionNavigation groups={filteredGroups} query={normalizedQuery ? query : ''} onQueryChange={setQuery} displayMode={displayMode} /></div>
      <div className="hidden min-h-0 flex-1 xl:flex">
        <SplitNavigation
          groups={groups}
          searchGroups={filteredGroups}
          query={normalizedQuery ? query : ''}
          onQueryChange={setQuery}
          primaryRailWidth={primaryRailWidth}
          resizingPrimaryRail={resizingPrimaryRail}
          displayMode={displayMode}
          onPrimaryRailResizeStart={() => setResizingPrimaryRail(true)}
          onPrimaryRailResizeReset={() => setPrimaryRailWidth(primaryRailWidthConfig[displayMode].defaultWidth)}
          onPrimaryRailResizeBy={(delta) => setPrimaryRailWidth((current) => (
            clampPrimaryRailWidth(current + delta, displayMode)
          ))}
        />
      </div>
    </>
  )
}
