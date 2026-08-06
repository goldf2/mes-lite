'use client'

import { ReactNode, useState } from 'react'
import AdaptiveMasterDetailWorkspace, { CompactMasterDetailMode, CompactMasterDetailModeSelector } from '../layout/AdaptiveMasterDetailWorkspace'
import { DisplayMode } from '../ViewModeToggle'
import ResourceCardGrid from './ResourceCardGrid'
import ResourceCollection from './ResourceCollection'
import ResourceTable, { ResourceTableColumn } from './ResourceTable'
import ResourceToolbar from './ResourceToolbar'

export interface ResourcePageRenderContext<T> {
  item: T
  selected: boolean
  select: () => void
}

export default function ResourcePage<T, M extends DisplayMode = DisplayMode>({
  resourceKey,
  title,
  description,
  items,
  getKey,
  columns,
  renderCard,
  selectedKey,
  onSelect,
  detail,
  loading = false,
  loadingLabel = '正在加载数据…',
  error,
  onRetry,
  emptyLabel = '暂无数据',
  emptyAction,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  filterCount = 0,
  filterSummary,
  actions,
  viewMode,
  onViewModeChange,
  displayModes,
  onCreate,
  createLabel,
  summary,
  toolbarPlacement = 'portal',
  rowLabel,
}: {
  resourceKey: string
  title: ReactNode
  description?: ReactNode
  items: T[]
  getKey: (item: T) => string
  columns: ResourceTableColumn<T>[]
  renderCard?: (context: ResourcePageRenderContext<T>) => ReactNode
  selectedKey?: string | null
  onSelect?: (item: T) => void
  detail?: ReactNode
  loading?: boolean
  loadingLabel?: string
  error?: ReactNode
  onRetry?: () => void
  emptyLabel?: ReactNode
  emptyAction?: ReactNode
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  filters?: ReactNode
  filterCount?: number
  filterSummary?: ReactNode
  actions?: ReactNode
  viewMode: M
  onViewModeChange: (value: M) => void
  displayModes?: readonly M[]
  onCreate?: () => void
  createLabel?: string
  summary?: ReactNode
  toolbarPlacement?: 'portal' | 'inline'
  rowLabel?: (item: T) => string
}) {
  const [compactMode, setCompactMode] = useState<CompactMasterDetailMode>('overlay')
  const collection = (
    <ResourceCollection
      loading={loading}
      loadingLabel={loadingLabel}
      error={error}
      onRetry={onRetry}
      itemCount={items.length}
      emptyLabel={emptyLabel}
      emptyAction={emptyAction}
      viewMode={viewMode}
      list={(
        <ResourceTable
          items={items}
          columns={columns}
          getKey={getKey}
          selectedKey={selectedKey}
          onSelect={onSelect}
          rowLabel={rowLabel}
        />
      )}
      cards={renderCard ? (
        <ResourceCardGrid
          items={items}
          getKey={getKey}
          selectedKey={selectedKey}
          onSelect={onSelect}
          itemLabel={rowLabel}
          renderCard={(item) => renderCard({
            item,
            selected: getKey(item) === selectedKey,
            select: () => onSelect?.(item),
          })}
        />
      ) : undefined}
      columns={renderCard ? (
        <ResourceCardGrid
          items={items}
          getKey={getKey}
          selectedKey={selectedKey}
          onSelect={onSelect}
          itemLabel={rowLabel}
          variant="columns"
          renderCard={(item) => renderCard({
            item,
            selected: getKey(item) === selectedKey,
            select: () => onSelect?.(item),
          })}
        />
      ) : undefined}
      gallery={renderCard ? (
        <ResourceCardGrid
          items={items}
          getKey={getKey}
          selectedKey={selectedKey}
          onSelect={onSelect}
          itemLabel={rowLabel}
          variant="gallery"
          renderCard={(item) => renderCard({
            item,
            selected: getKey(item) === selectedKey,
            select: () => onSelect?.(item),
          })}
        />
      ) : undefined}
    />
  )

  return (
    <div className="min-w-0 space-y-3">
      <header className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-gray-900">{title}</h1>
          {description && <div className="min-w-0 truncate text-sm text-gray-500">{description}</div>}
        </div>
        {summary && <div className="hidden shrink-0 sm:block">{summary}</div>}
      </header>

      <ResourceToolbar
        searchStorageKey={`mes-lite.resource.${resourceKey}.searches.v1`}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        filterCount={filterCount}
        filterSummary={filterSummary}
        actions={actions}
        viewMode={renderCard ? viewMode : undefined}
        onViewModeChange={renderCard ? onViewModeChange : undefined}
        displayModes={displayModes}
        onCreate={onCreate}
        createLabel={createLabel}
        placement={toolbarPlacement}
        mobilePreferences={detail ? (
          <CompactMasterDetailModeSelector value={compactMode} onChange={setCompactMode} />
        ) : undefined}
      />

      {detail ? (
        <AdaptiveMasterDetailWorkspace
          storageKey={`mes-lite.resource.${resourceKey}.workspace.${viewMode === 'columns' ? 'columns' : 'standard'}.v1`}
          primaryLabel={`${String(title)}列表`}
          secondaryLabel={`${String(title)}详情`}
          primaryCount={items.length}
          selectionKey={selectedKey}
          primary={collection}
          secondary={detail}
          compactMode={compactMode}
          onCompactModeChange={setCompactMode}
          desktopPrimaryPercent={viewMode === 'columns' ? 34 : 58}
          desktopMinPrimaryPercent={viewMode === 'columns' ? 26 : 38}
          desktopMaxPrimaryPercent={viewMode === 'columns' ? 48 : 68}
        />
      ) : collection}
    </div>
  )
}
