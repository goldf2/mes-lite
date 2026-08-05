'use client'

import type { DragEvent, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

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

function AccordionNavigation({ groups }: { groups: DesktopNavigationGroup[] }) {
  return (
    <nav aria-label="一级与二级功能菜单" className="min-h-0 flex-1 space-y-0 overflow-y-auto px-1.5 py-1">
      {groups.map((group, index) => (
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
    </nav>
  )
}

function SplitNavigation({ groups }: { groups: DesktopNavigationGroup[] }) {
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
        <div className="shrink-0 border-b border-gray-100 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">功能菜单</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{activeGroup?.label || '导航'}</div>
        </div>
        <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-2 py-2">
          {activeGroup?.items.map((item) => <NavigationItemButton key={item.id} item={item} showIcon={Boolean(item.icon)} />)}
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
  if (mode === 'accordion') return <AccordionNavigation groups={groups} />

  return (
    <>
      <div className="contents xl:hidden"><AccordionNavigation groups={groups} /></div>
      <div className="hidden min-h-0 flex-1 xl:flex"><SplitNavigation groups={groups} /></div>
    </>
  )
}
