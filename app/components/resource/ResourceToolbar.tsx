'use client'

import { ReactNode } from 'react'
import AppButton from '../AppButton'
import ResponsiveToolbarActions from '../ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '../SavedSearchPresets'
import TopBarPortal from '../TopBarPortal'
import ViewModeToggle, { ViewMode } from '../ViewModeToggle'

export default function ResourceToolbar({
  searchStorageKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
  viewMode,
  onViewModeChange,
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
  viewMode?: ViewMode
  onViewModeChange?: (value: ViewMode) => void
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
          {viewMode && onViewModeChange && <ViewModeToggle value={viewMode} onChange={onViewModeChange} />}
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
