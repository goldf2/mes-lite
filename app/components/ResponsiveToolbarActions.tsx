'use client'

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export default function ResponsiveToolbarActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [canInline, setCanInline] = useState<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  const updateLayout = useCallback(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    const availableWidth = container.getBoundingClientRect().width
    const requiredWidth = measure.scrollWidth
    const requiredHeight = measure.scrollHeight
    const nextCanInline = requiredWidth + 24 <= availableWidth && requiredHeight <= 56
    setCanInline((current) => current === nextCanInline ? current : nextCanInline)
  }, [])

  useLayoutEffect(() => {
    updateLayout()
  }, [updateLayout])

  useEffect(() => {
    const observer = new ResizeObserver(updateLayout)
    if (containerRef.current) observer.observe(containerRef.current)
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

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 justify-end">
      <div
        ref={measureRef}
        aria-hidden="true"
        inert={'true' as unknown as boolean}
        className="pointer-events-none invisible absolute right-0 top-0 -z-10 flex w-full flex-nowrap items-center justify-end gap-3 overflow-visible whitespace-nowrap"
      >
        {children}
      </div>
      {canInline === true && (
        <div className="flex min-w-0 flex-nowrap items-center justify-end gap-3">
          {children}
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
                {children}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
