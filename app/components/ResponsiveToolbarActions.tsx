'use client'

import { ReactNode } from 'react'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
}

export default function ResponsiveToolbarActions({ children, filters, actions }: ResponsiveToolbarActionsProps) {
  const filterContent = filters ?? children
  const hasFilters = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-2 xl:gap-3">
      {hasFilters && (
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-1 [scrollbar-width:thin]">
          <div className="flex min-w-max flex-nowrap items-center justify-start gap-2 whitespace-nowrap xl:gap-3">
            {filterContent}
          </div>
        </div>
      )}
      {hasActions && (
        <div className="flex min-w-max shrink-0 flex-nowrap items-center justify-end gap-2 whitespace-nowrap xl:gap-3">
          {actions}
        </div>
      )}
      {!hasActions && !hasFilters && (
        <div className="sr-only">无工具栏操作</div>
      )}
    </div>
  )
}
