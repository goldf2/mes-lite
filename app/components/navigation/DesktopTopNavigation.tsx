'use client'

import { MoreHorizontal, Search, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import ControlTooltip from '../ControlTooltip'
import type { DesktopNavigationGroup } from './DesktopNavigation'

type OpenPanel = { type: 'group'; id: string } | { type: 'more' } | { type: 'search' } | null

const HOVER_SWITCH_DELAY_MS = 180
const COMPACT_PANEL_WIDTH_PX = 288
const WIDE_PANEL_WIDTH_PX = 544
const PANEL_EDGE_GAP_PX = 8

export default function DesktopTopNavigation({ groups }: { groups: DesktopNavigationGroup[] }) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [query, setQuery] = useState('')
  const [availableWidth, setAvailableWidth] = useState(720)
  const [panelGeometry, setPanelGeometry] = useState({ left: PANEL_EDGE_GAP_PX, width: WIDE_PANEL_WIDTH_PX })
  const capacityRef = useRef<HTMLDivElement | null>(null)
  const hoverSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(Boolean(openPanel), () => setOpenPanel(null))

  const cancelHoverSwitch = () => {
    if (hoverSwitchTimerRef.current === null) return
    clearTimeout(hoverSwitchTimerRef.current)
    hoverSwitchTimerRef.current = null
  }

  const scheduleGroupSwitch = (groupId: string, trigger: HTMLButtonElement) => {
    if (openPanel?.type !== 'group' || openPanel.id === groupId) return
    cancelHoverSwitch()
    hoverSwitchTimerRef.current = setTimeout(() => {
      panelTriggerRef.current = trigger
      setOpenPanel((current) => current?.type === 'group' ? { type: 'group', id: groupId } : current)
      hoverSwitchTimerRef.current = null
    }, HOVER_SWITCH_DELAY_MS)
  }

  useEffect(() => {
    const container = capacityRef.current
    if (!container) return
    const update = () => setAvailableWidth(container.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!openPanel) setQuery('')
  }, [openPanel])

  useEffect(() => () => cancelHoverSwitch(), [])

  const visibleCount = Math.max(1, Math.min(groups.length, Math.floor((availableWidth - 84) / 72)))
  const visibleGroups = groups.slice(0, visibleCount)
  const hiddenGroups = groups.slice(visibleCount)
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const searchGroups = useMemo(() => {
    if (!normalizedQuery) return groups
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        group.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
        || item.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      )),
    })).filter((group) => group.items.length > 0)
  }, [groups, normalizedQuery])

  const selectItem = (onClick: () => void) => {
    setOpenPanel(null)
    onClick()
  }

  const panelGroups = openPanel?.type === 'more'
    ? hiddenGroups
    : openPanel?.type === 'search'
      ? searchGroups
      : openPanel?.type === 'group'
        ? groups.filter((group) => group.id === openPanel.id)
        : []
  const compactGroupPanel = openPanel?.type === 'group' && (panelGroups[0]?.items.length ?? 0) <= 2

  useLayoutEffect(() => {
    if (!openPanel) return
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const requestedWidth = compactGroupPanel ? COMPACT_PANEL_WIDTH_PX : WIDE_PANEL_WIDTH_PX
    const availablePanelWidth = Math.max(0, Math.min(rootRect.width - PANEL_EDGE_GAP_PX * 2, window.innerWidth - 24))
    const width = Math.min(requestedWidth, availablePanelWidth)
    const trigger = panelTriggerRef.current
    const triggerLeft = trigger?.isConnected
      ? trigger.getBoundingClientRect().left - rootRect.left
      : PANEL_EDGE_GAP_PX
    const maximumLeft = Math.max(PANEL_EDGE_GAP_PX, rootRect.width - width - PANEL_EDGE_GAP_PX)
    const left = Math.min(Math.max(PANEL_EDGE_GAP_PX, triggerLeft), maximumLeft)
    setPanelGeometry((current) => current.left === left && current.width === width ? current : { left, width })
  }, [availableWidth, compactGroupPanel, openPanel, rootRef])

  return (
    <div ref={rootRef} className="relative flex h-full min-w-0 flex-1 items-center">
      <div ref={capacityRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden px-2">
        <button
          type="button"
          aria-label="搜索功能导航"
          aria-expanded={openPanel?.type === 'search'}
          onClick={(event) => {
            panelTriggerRef.current = event.currentTarget
            setOpenPanel((current) => current?.type === 'search' ? null : { type: 'search' })
          }}
          className={`group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${openPanel?.type === 'search' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          <ControlTooltip label="搜索功能导航" hidden={openPanel?.type === 'search'} />
        </button>
        {visibleGroups.map((group) => {
          const isOpenGroup = openPanel?.type === 'group' && openPanel.id === group.id
          const activeAppearance = isOpenGroup
            ? 'bg-blue-600 text-white shadow-sm'
            : group.active
              ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          return (
            <button
              key={group.id}
              type="button"
              aria-current={group.active ? 'page' : undefined}
              aria-expanded={isOpenGroup}
              onPointerEnter={(event) => scheduleGroupSwitch(group.id, event.currentTarget)}
              onPointerLeave={cancelHoverSwitch}
              onClick={(event) => {
                cancelHoverSwitch()
                panelTriggerRef.current = event.currentTarget
                setOpenPanel((current) => current?.type === 'group' && current.id === group.id ? null : { type: 'group', id: group.id })
              }}
              className={`flex h-9 min-w-0 max-w-[6rem] shrink-0 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition ${activeAppearance}`}
            >
              <span className="truncate">{group.label}</span>
            </button>
          )
        })}
        {hiddenGroups.length > 0 && (
          <button
            type="button"
            aria-expanded={openPanel?.type === 'more'}
            onClick={(event) => {
              panelTriggerRef.current = event.currentTarget
              setOpenPanel((current) => current?.type === 'more' ? null : { type: 'more' })
            }}
            className={`flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium transition ${openPanel?.type === 'more' ? 'bg-blue-600 text-white shadow-sm' : hiddenGroups.some((group) => group.active) ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
            更多
          </button>
        )}
      </div>

      {openPanel && (
        <div
          role="dialog"
          aria-label="顶部功能导航"
          style={{ left: panelGeometry.left, width: panelGeometry.width }}
          className="absolute top-[calc(100%+8px)] z-[120] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
            <div className="text-sm font-semibold text-gray-900">{openPanel.type === 'search' ? '搜索功能' : openPanel.type === 'more' ? '更多功能' : panelGroups[0]?.label}</div>
            <button type="button" onClick={() => setOpenPanel(null)} aria-label="关闭功能导航" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          {openPanel.type === 'search' && (
            <div className="border-b border-gray-100 p-3">
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索功能名称或分组" className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          )}
          <div className="max-h-[min(65dvh,32rem)] space-y-3 overflow-y-auto p-3">
            {panelGroups.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">没有匹配的功能</div>
            ) : panelGroups.map((group) => (
              <section key={group.id} aria-label={`${group.label}功能`}>
                {(openPanel.type === 'more' || openPanel.type === 'search') && <div className="mb-1 px-2 text-xs font-semibold text-gray-400">{group.label}</div>}
                <div className={`grid grid-cols-1 gap-1 ${compactGroupPanel ? '' : 'sm:grid-cols-2'}`}>
                  {group.items.map((item) => (
                    <button key={item.id} type="button" aria-current={item.active ? 'page' : undefined} onClick={() => selectItem(item.onClick)} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-left text-sm transition ${item.active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
