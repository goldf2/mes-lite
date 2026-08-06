'use client'

import { ReactNode } from 'react'
import AppButton from '../AppButton'
import ResponsiveToolbarActions from '../ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '../SavedSearchPresets'
import TopBarPortal from '../TopBarPortal'
import ViewModeToggle, { DisplayMode } from '../ViewModeToggle'

export default function ResourceToolbar<M extends DisplayMode = DisplayMode>({
  searchStorageKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
  viewMode,
  onViewModeChange,
  displayModes,
  iconSize,
  onIconSizeChange,
  onCreate,
  createLabel = '新增',
  filterCount = 0,
  filterSummary,
  mobilePreferences,
  placement = 'portal',
  filterPresentation = 'popover',
}: {
  searchStorageKey: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  filters?: ReactNode
  actions?: ReactNode
  viewMode?: M
  onViewModeChange?: (value: M) => void
  displayModes?: readonly M[]
  iconSize?: number
  onIconSizeChange?: (value: number) => void
  onCreate?: () => void
  createLabel?: string
  filterCount?: number
  filterSummary?: ReactNode
  mobilePreferences?: ReactNode
  placement?: 'portal' | 'inline'
  filterPresentation?: 'dialog' | 'popover'
}) {
  const toolbarActions = viewMode && onViewModeChange || actions || onCreate
    ? (
        <>
          {viewMode && onViewModeChange && (
            <ViewModeToggle
              value={viewMode}
              onChange={onViewModeChange}
              modes={displayModes}
              iconSize={iconSize}
              onIconSizeChange={onIconSizeChange}
            />
          )}
          {actions}
          {onCreate && <AppButton variant="create" onClick={onCreate}>{createLabel}</AppButton>}
        </>
      )
    : null

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={(
        <SearchFieldWithPresets
          storageKey={searchStorageKey}
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      )}
      filters={filters}
      filterCount={filterCount}
      filterSummary={filterSummary}
      preferences={mobilePreferences}
      filterPresentation={filterPresentation}
      actions={toolbarActions}
    />
  )

  return placement === 'portal' ? <TopBarPortal>{toolbar}</TopBarPortal> : toolbar
}
