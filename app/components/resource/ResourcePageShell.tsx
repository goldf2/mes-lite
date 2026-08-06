'use client'

import { ReactNode } from 'react'
import type { DisplayMode } from '../ViewModeToggle'
import ResourceToolbar from './ResourceToolbar'
import type { ResourceSearchCondition } from '@/lib/resource-search'

export function createResourceActionLabel(resourceLabel: string) {
  return /^[A-Za-z0-9][A-Za-z0-9\s/_-]*$/.test(resourceLabel)
    ? `新建 ${resourceLabel}`
    : `新建${resourceLabel}`
}

export default function ResourcePageShell<M extends DisplayMode = DisplayMode>({
  resourceKey,
  title,
  description,
  summary,
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
  onCreate,
  createLabel,
  resourceLabel,
  toolbarPlacement = 'portal',
  children,
  contentClassName = 'overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm',
}: {
  resourceKey: string
  title: ReactNode
  description?: ReactNode
  summary?: ReactNode
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
  onCreate?: () => void
  createLabel?: string
  resourceLabel?: string
  toolbarPlacement?: 'portal' | 'inline'
  children: ReactNode
  contentClassName?: string
}) {
  const resolvedCreateLabel = createLabel || (resourceLabel ? createResourceActionLabel(resourceLabel) : undefined)

  return (
    <div className="min-w-0 space-y-3">
      <ResourceToolbar
        searchStorageKey={`mes-lite.resource.${resourceKey}.searches.v2`}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        advancedSearch={advancedSearch}
        searchConditions={searchConditions}
        onSearchConditionsChange={onSearchConditionsChange}
        searchConditionLabel={searchConditionLabel}
        actions={actions}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        displayModes={displayModes}
        onCreate={onCreate}
        createLabel={resolvedCreateLabel}
        placement={toolbarPlacement}
      />

      <header className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-gray-900">{title}</h1>
          {description && <div className="min-w-0 text-sm text-gray-500">{description}</div>}
        </div>
        {summary && <div className="shrink-0 text-sm text-gray-500">{summary}</div>}
      </header>

      <section className={contentClassName}>{children}</section>
    </div>
  )
}
