'use client'

import { ReactNode } from 'react'
import AppButton from '../AppButton'
import ResponsiveToolbarActions from '../ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '../SavedSearchPresets'
import TopBarPortal from '../TopBarPortal'
import ViewModeToggle, { DisplayMode } from '../ViewModeToggle'
import type { ResourceSearchCondition } from '@/lib/resource-search'

export default function ResourceToolbar<M extends DisplayMode = DisplayMode>({
  searchStorageKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  advancedSearch,
  searchConditions,
  onSearchConditionsChange,
  searchConditionLabel,
  actions,
  viewMode,
  onViewModeChange,
  displayModes,
  iconSize,
  onIconSizeChange,
  onCreate,
  createLabel = '新建',
  filterCount = 0,
  filterSummary,
  mobilePreferences,
  placement = 'portal',
}: {
  searchStorageKey?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  advancedSearch?: ReactNode
  searchConditions?: readonly ResourceSearchCondition[]
  onSearchConditionsChange?: (conditions: ResourceSearchCondition[]) => void
  searchConditionLabel?: string
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
}) {
  const toolbarActions = actions || onCreate
    ? (
        <>
          {actions}
          {onCreate && <AppButton variant="create" onClick={onCreate}>{createLabel}</AppButton>}
        </>
      )
    : null

  const viewControl = viewMode && onViewModeChange ? (
    <ViewModeToggle
      value={viewMode}
      onChange={onViewModeChange}
      modes={displayModes}
      iconSize={iconSize}
      onIconSizeChange={onIconSizeChange}
    />
  ) : undefined

  const search = searchStorageKey && searchValue !== undefined && onSearchChange && searchPlaceholder
    ? (
        <SearchFieldWithPresets
          storageKey={searchStorageKey}
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          conditions={searchConditions}
          onConditionsChange={onSearchConditionsChange}
          conditionLabel={searchConditionLabel}
        />
      )
    : undefined

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={search}
      advancedSearch={advancedSearch}
      filterCount={filterCount}
      filterSummary={filterSummary}
      preferences={mobilePreferences}
      viewControl={viewControl}
      actions={toolbarActions}
    />
  )

  return placement === 'portal' ? <TopBarPortal>{toolbar}</TopBarPortal> : toolbar
}
