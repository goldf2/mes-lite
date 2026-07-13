'use client'

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
}

export default function ResponsiveToolbarActions({ children, filters, actions }: ResponsiveToolbarActionsProps) {
  const [open, setOpen] = useState(false)
  const [canInline, setCanInline] = useState<boolean | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const filterContainerRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const filterContent = filters ?? children
  const hasFilters = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false

  const updateLayout = useCallback(() => {
    const container = filterContainerRef.current
    const measure = measureRef.current
    if (!hasFilters) {
      setCanInline(true)
      return
    }
    if (!container || !measure) return

    const availableWidth = container.getBoundingClientRect().width
    const requiredWidth = measure.scrollWidth
    const requiredHeight = measure.scrollHeight
    const nextCanInline = requiredWidth + 24 <= availableWidth && requiredHeight <= 56
    setCanInline((current) => current === nextCanInline ? current : nextCanInline)
  }, [hasFilters])

  useLayoutEffect(() => {
    updateLayout()
  }, [updateLayout])

  useEffect(() => {
    const observer = new ResizeObserver(updateLayout)
    if (filterContainerRef.current) observer.observe(filterContainerRef.current)
    if (measureRef.current) observer.observe(measureRef.current)
    window.addEventListener('resize', updateLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [updateLayout])

  useEffect(() => {
    if (canInline) setOpen(false)
  }, [canInline])

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      const root = rootRef.current
      if (!root || root.contains(event.target as Node)) return
      setOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
      {hasFilters && (
        <div ref={filterContainerRef} className="relative flex min-w-0 flex-1 justify-end">
          <div
            ref={measureRef}
            aria-hidden="true"
            inert={'true' as unknown as boolean}
            className="pointer-events-none invisible absolute right-0 top-0 -z-10 flex w-full flex-nowrap items-center justify-end gap-3 overflow-visible whitespace-nowrap"
          >
            {filterContent}
          </div>
          {canInline === true && (
            <div className="flex min-w-0 flex-nowrap items-center justify-end gap-3">
              {filterContent}
            </div>
          )}
          {canInline === false && (
            <>
              <button
                type="button"
                onClick={() => setOpen((next) => !next)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                筛选/操作
              </button>
              {open && (
                <div className="absolute right-0 top-full z-20 mt-2 w-[min(88vw,420px)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {filterContent}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {hasActions && (
        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-3">
          {actions}
        </div>
      )}
      {!hasActions && !hasFilters && (
        <div className="sr-only">无工具栏操作</div>
      )}
    </div>
  )
}
