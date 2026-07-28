'use client'

import { ReactNode, useState } from 'react'
import ModalOverlay from './ModalOverlay'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  primaryFilters?: ReactNode
  filters?: ReactNode
  filterCount?: number
  filterSummary?: ReactNode
  actions?: ReactNode
}

export default function ResponsiveToolbarActions({ children, primaryFilters, filters, filterCount = 0, filterSummary, actions }: ResponsiveToolbarActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const filterContent = filters ?? children
  const hasPrimaryFilters = primaryFilters !== null && primaryFilters !== undefined && primaryFilters !== false
  const hasFilters = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false

  return (
    <div className="relative flex w-full min-w-0 flex-wrap items-center justify-start gap-2 xl:gap-3">
      {hasPrimaryFilters && (
        <div className="flex min-w-0 flex-[1_1_260px] flex-wrap items-center justify-start gap-2 overflow-visible xl:gap-3">
          {primaryFilters}
        </div>
      )}
      {hasFilters && (
        <div className="relative flex min-w-0 shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3 sm:py-2 sm:text-sm"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[11px] text-gray-600">筛</span>
            <span>{filterCount > 0 ? `筛选 ${filterCount}` : '筛选'}</span>
          </button>
          {filterSummary && (
            <div className="hidden min-w-0 flex-wrap items-center gap-1 md:flex">
              {filterSummary}
            </div>
          )}
          {menuOpen && (
            <ModalOverlay onClose={() => setMenuOpen(false)}>
              <div className="max-h-[calc(100vh-32px)] w-[min(calc(100vw-24px),560px)] overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                  <div className="text-sm font-semibold text-gray-900">筛选条件</div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                  >
                    关闭
                  </button>
                </div>
                <div className="flex max-h-[calc(100vh-112px)] w-full flex-col items-stretch gap-3 overflow-y-auto overflow-x-hidden [&>*]:!max-w-full [&>*]:!flex-wrap [&>*]:!whitespace-normal">
                  {filterContent}
                </div>
              </div>
            </ModalOverlay>
          )}
        </div>
      )}
      {hasActions && (
        <div className="flex min-w-max shrink-0 flex-nowrap items-center justify-end gap-2 whitespace-nowrap xl:gap-3">
          {actions}
        </div>
      )}
      {!hasActions && !hasFilters && !hasPrimaryFilters && (
        <div className="sr-only">无工具栏操作</div>
      )}
    </div>
  )
}
