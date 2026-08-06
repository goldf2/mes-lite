'use client'

import { ReactNode } from 'react'
import AppButton from '../AppButton'
import AppLoadingIndicator from '../AppLoadingIndicator'
import { DisplayMode } from '../ViewModeToggle'

export default function ResourceCollection({
  loading,
  loadingLabel,
  error,
  onRetry,
  itemCount,
  emptyLabel,
  emptyAction,
  viewMode = 'list',
  list,
  cards,
  columns,
  gallery,
  className = '',
}: {
  loading: boolean
  loadingLabel: string
  error?: ReactNode
  onRetry?: () => void
  itemCount: number
  emptyLabel: ReactNode
  emptyAction?: ReactNode
  viewMode?: DisplayMode
  list: ReactNode
  cards?: ReactNode
  columns?: ReactNode
  gallery?: ReactNode
  className?: string
}) {
  return (
    <section className={`h-full min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-sm ${viewMode !== 'list' ? 'p-3 sm:p-4' : ''} ${className}`}>
      {loading ? (
        <div className="flex min-h-80 items-center justify-center"><AppLoadingIndicator label={loadingLabel} /></div>
      ) : error ? (
        <div role="alert" className="px-4 py-12 text-center text-sm text-red-700">
          <div className="font-medium">加载失败</div>
          <div className="mt-1 text-red-600">{error}</div>
          {onRetry && <AppButton className="mt-4" size="sm" onClick={onRetry}>重新加载</AppButton>}
        </div>
      ) : itemCount === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-gray-500">
          <div>{emptyLabel}</div>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : viewMode === 'gallery' && gallery ? gallery
        : viewMode === 'columns' && columns ? columns
          : viewMode === 'card' && cards ? cards
            : list}
    </section>
  )
}
