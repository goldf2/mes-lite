'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NavigationGroup, NavigationItem } from './NavigationModel'

export type NavigationDisplayMode = 'icon' | 'icon-label' | 'label'
export type NavigationGroupHeaderMode = 'button' | 'static' | 'hidden'
export type NavigationItemLayout = 'list' | 'grid'

export interface UnifiedNavigationMenuProps {
  groups: NavigationGroup[]
  groupHeaderMode?: NavigationGroupHeaderMode
  expandedGroupIds?: ReadonlySet<string> | 'all'
  displayMode?: NavigationDisplayMode
  itemLayout?: NavigationItemLayout
  showItemIcons?: boolean
  ariaLabel?: string
  className?: string
  onGroupSelect?: (group: NavigationGroup) => void
  onItemSelect?: (item: NavigationItem, group: NavigationGroup) => void
  renderItemTrailing?: (item: NavigationItem, index: number, group: NavigationGroup) => ReactNode
}

function groupIsExpanded(group: NavigationGroup, expandedGroupIds: ReadonlySet<string> | 'all') {
  return expandedGroupIds === 'all' || expandedGroupIds.has(group.id)
}

export default function UnifiedNavigationMenu({
  groups,
  groupHeaderMode = 'static',
  expandedGroupIds = 'all',
  displayMode = 'icon-label',
  itemLayout = 'list',
  showItemIcons = false,
  ariaLabel = '功能菜单',
  className = '',
  onGroupSelect,
  onItemSelect,
  renderItemTrailing,
}: UnifiedNavigationMenuProps) {
  return (
    <div data-unified-navigation-menu aria-label={ariaLabel} className={className}>
      {groups.map((group, groupIndex) => {
        const expanded = groupIsExpanded(group, expandedGroupIds)
        const accountDivider = group.id === 'account' && groupIndex > 0
        return (
          <section
            key={group.id}
            data-navigation-group={group.id}
            aria-label={`${group.label}功能`}
            className={accountDivider ? 'mt-1 border-t border-gray-100 pt-1' : ''}
          >
            {groupHeaderMode === 'button' && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-current={group.active ? 'true' : undefined}
                aria-label={group.label}
                title={displayMode === 'icon' ? group.label : undefined}
                onClick={() => {
                  if (onGroupSelect) onGroupSelect(group)
                  else group.onClick()
                }}
                className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1 text-sm font-semibold transition ${
                  group.active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {displayMode !== 'label' && group.icon}
                  {displayMode !== 'icon' && <span className="truncate">{group.label}</span>}
                </span>
                <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : '-rotate-90'}`} />
              </button>
            )}

            {groupHeaderMode === 'static' && (
              <div className="flex min-h-9 items-center gap-2 px-2.5 py-1 text-xs font-semibold text-gray-400">
                {displayMode !== 'label' && group.icon}
                {displayMode !== 'icon' && <span className="truncate">{group.label}</span>}
              </div>
            )}

            {expanded && (
              <div
                data-navigation-items={group.id}
                className={`${groupHeaderMode === 'button' ? 'ml-4 border-l border-gray-200 pl-2' : ''} ${
                  itemLayout === 'grid' ? 'grid grid-cols-1 gap-1 sm:grid-cols-2' : 'space-y-0.5'
                }`}
              >
                {group.items.map((item, itemIndex) => {
                  const trailing = renderItemTrailing?.(item, itemIndex, group)
                  return (
                    <div key={item.id} data-navigation-item={item.id} className="flex min-h-10 items-center gap-2">
                      <button
                        type="button"
                        draggable={item.draggable}
                        aria-current={item.active ? 'page' : undefined}
                        onClick={() => {
                          if (onItemSelect) onItemSelect(item, group)
                          else item.onClick()
                        }}
                        onDragStart={item.onDragStart}
                        onDragOver={item.onDragOver}
                        onDragLeave={item.onDragLeave}
                        onDrop={item.onDrop}
                        className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          item.dragState === 'dragging' ? 'opacity-50' : item.dragState === 'target' ? 'ring-2 ring-blue-300' : ''
                        } ${item.active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
                      >
                        {showItemIcons && item.icon}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </button>
                      {trailing ?? (item.draggable ? <span aria-hidden="true" className="shrink-0 px-1 text-xs text-gray-300">⋮⋮</span> : null)}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
