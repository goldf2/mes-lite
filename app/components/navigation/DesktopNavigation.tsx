'use client'

import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type DesktopNavigationMode = 'accordion' | 'split'

export interface DesktopNavigationItem {
  id: string
  label: string
  active: boolean
  icon?: ReactNode
  draggable?: boolean
  dragState?: 'idle' | 'dragging' | 'target'
  onClick: () => void
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void
  onDragLeave?: () => void
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void
}

export interface DesktopNavigationGroup {
  id: string
  label: string
  icon: ReactNode
  active: boolean
  items: DesktopNavigationItem[]
  onClick: () => void
}

function NavigationItemButton({ item, showIcon = false }: { item: DesktopNavigationItem; showIcon?: boolean }) {
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

function NavigationSearchResults({ groups }: { groups: DesktopNavigationGroup[] }) {
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
}: {
  groups: DesktopNavigationGroup[]
  query: string
  onQueryChange: (value: string) => void
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
              onClick={group.onClick}
              className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1 text-sm font-semibold transition ${
                group.active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {group.icon}
                <span className="truncate">{group.label}</span>
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
}: {
  groups: DesktopNavigationGroup[]
  searchGroups: DesktopNavigationGroup[]
  query: string
  onQueryChange: (value: string) => void
}) {
  const activeGroup = groups.find((group) => group.active) || groups[0]

  return (
    <nav aria-label="双列一级与二级功能菜单" className="flex min-h-0 flex-1 overflow-hidden">
      <div className="w-[84px] shrink-0 overflow-y-auto border-r border-gray-200 bg-slate-50 px-1.5 py-2">
        <div className="space-y-1">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-current={group.active ? 'true' : undefined}
              onClick={group.onClick}
              className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold leading-tight transition ${
                group.active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              {group.icon}
              <span className="max-w-full truncate">{group.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <NavigationSearch value={query} onChange={onQueryChange} />
        <div className="shrink-0 border-y border-gray-100 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">功能菜单</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{query ? '搜索结果' : activeGroup?.label || '导航'}</div>
        </div>
        <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-2 py-2">
          {query
            ? <NavigationSearchResults groups={searchGroups} />
            : activeGroup?.items.map((item) => <NavigationItemButton key={item.id} item={item} showIcon={Boolean(item.icon)} />)}
        </div>
      </div>
    </nav>
  )
}

export default function DesktopNavigation({
  mode,
  groups,
}: {
  mode: DesktopNavigationMode
  groups: DesktopNavigationGroup[]
}) {
  const [query, setQuery] = useState('')
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

  if (mode === 'accordion') {
    return <AccordionNavigation groups={filteredGroups} query={normalizedQuery ? query : ''} onQueryChange={setQuery} />
  }

  return (
    <>
      <div className="contents xl:hidden"><AccordionNavigation groups={filteredGroups} query={normalizedQuery ? query : ''} onQueryChange={setQuery} /></div>
      <div className="hidden min-h-0 flex-1 xl:flex"><SplitNavigation groups={groups} searchGroups={filteredGroups} query={normalizedQuery ? query : ''} onQueryChange={setQuery} /></div>
    </>
  )
}
