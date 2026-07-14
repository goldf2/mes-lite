'use client'

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
}

export default function ResponsiveToolbarActions({ children, filters, actions }: ResponsiveToolbarActionsProps) {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const filterSlotRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const filterContent = filters ?? children
  const hasFilters = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false

  const updateLayout = useCallback(() => {
    if (!hasFilters) {
      setFiltersCollapsed(false)
      return
    }

    const slot = filterSlotRef.current
    const measure = measureRef.current
    if (!slot || !measure) return

    const availableWidth = slot.getBoundingClientRect().width
    const requiredWidth = measure.scrollWidth
    const nextCollapsed = requiredWidth > availableWidth + 2
    setFiltersCollapsed((current) => current === nextCollapsed ? current : nextCollapsed)
  }, [hasFilters])

  useLayoutEffect(() => {
    updateLayout()
  }, [updateLayout, filterContent, actions])

  useEffect(() => {
    const observer = new ResizeObserver(updateLayout)
    if (rootRef.current) observer.observe(rootRef.current)
    if (filterSlotRef.current) observer.observe(filterSlotRef.current)
    if (measureRef.current) observer.observe(measureRef.current)
    window.addEventListener('resize', updateLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [updateLayout])

  useEffect(() => {
    if (!filtersCollapsed) setMenuOpen(false)
  }, [filtersCollapsed])

  useEffect(() => {
    if (!menuOpen) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root || root.contains(event.target as Node)) return
      setMenuOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <div ref={rootRef} className="relative flex w-full min-w-0 flex-nowrap items-center justify-start gap-2 xl:gap-3">
      {hasFilters && (
        <div ref={filterSlotRef} className="relative min-w-0 flex-1">
          <div
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none invisible fixed left-0 top-0 h-0 w-0 overflow-hidden"
          >
            <div className="flex min-w-max flex-nowrap items-center gap-2 whitespace-nowrap xl:gap-3">
              {filterContent}
            </div>
          </div>
          {filtersCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3 sm:py-2 sm:text-sm"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[11px] text-gray-600">筛</span>
                <span>筛选</span>
              </button>
              {menuOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,520px)] max-w-[calc(100vw-24px)] rounded-lg border border-gray-200 bg-white p-2 shadow-lg sm:p-3">
                  <div className="flex max-h-[70vh] w-full flex-col items-stretch gap-2 overflow-y-auto overflow-x-hidden [&>*]:!max-w-full [&>*]:!flex-wrap [&>*]:!whitespace-normal">
                    {filterContent}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="min-w-0 overflow-hidden">
              <div className="flex min-w-max flex-nowrap items-center justify-start gap-2 whitespace-nowrap xl:gap-3">
                {filterContent}
              </div>
            </div>
          )}
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
