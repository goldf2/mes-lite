'use client'

import { PanelRightOpen, X } from 'lucide-react'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MovableEdgeTrigger from './layout/MovableEdgeTrigger'
import ModalOverlay from './ModalOverlay'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  primaryFilters?: ReactNode
  filters?: ReactNode
  filterCount?: number
  filterSummary?: ReactNode
  preferences?: ReactNode
  actions?: ReactNode
  filterPresentation?: 'dialog' | 'popover'
}

export default function ResponsiveToolbarActions({ children, primaryFilters, filters, filterCount = 0, filterSummary, preferences, actions, filterPresentation = 'dialog' }: ResponsiveToolbarActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [mobileToolsVisible, setMobileToolsVisible] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const mobileToolsPanelRef = useRef<HTMLElement | null>(null)
  const filterRootRef = useDismissibleSearchPopup<HTMLDivElement>(
    menuOpen && filterPresentation === 'popover',
    () => setMenuOpen(false)
  )
  const filterContent = filters ?? children
  const hasPrimaryFilters = primaryFilters !== null && primaryFilters !== undefined && primaryFilters !== false
  const hasFilters = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasPreferences = preferences !== null && preferences !== undefined && preferences !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false
  const hasAnyTools = hasPrimaryFilters || hasFilters || hasPreferences || hasActions

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  const openMobileTools = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    window.dispatchEvent(new CustomEvent('mes:side-dock-open', { detail: 'tools' }))
    setMobileToolsOpen(true)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setMobileToolsVisible(true)))
    setMenuOpen(false)
    setActionMenuOpen(false)
  }

  const closeMobileTools = () => {
    setMobileToolsVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setMobileToolsOpen(false)
      closeTimerRef.current = null
    }, 220)
  }

  useEffect(() => {
    if (!mobileToolsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (mobileToolsPanelRef.current?.contains(target)) return
      closeMobileTools()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileTools()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileToolsOpen])

  useEffect(() => {
    const handleSideDockOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail === 'tools') return
      setMobileToolsVisible(false)
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = window.setTimeout(() => {
        setMobileToolsOpen(false)
        closeTimerRef.current = null
      }, 220)
    }
    window.addEventListener('mes:side-dock-open', handleSideDockOpen)
    return () => window.removeEventListener('mes:side-dock-open', handleSideDockOpen)
  }, [])

  return (
    <div className="relative flex w-full min-w-0 flex-wrap items-center justify-start gap-2 xl:gap-3">
      {hasAnyTools && (
        <div className="ml-auto sm:hidden">
          <MovableEdgeTrigger
            edge="right"
            storageKey="mes-lite.edge-trigger.right.v1"
            label="呼出页面工具"
            active={mobileToolsOpen}
            onActivate={mobileToolsOpen ? closeMobileTools : openMobileTools}
            badge={filterCount > 0 ? filterCount : undefined}
            className="mes-dock-trigger-right"
          >
            <PanelRightOpen aria-hidden="true" size={19} className={`transition-transform duration-200 ${mobileToolsOpen ? 'rotate-180' : ''}`} />
          </MovableEdgeTrigger>
          {mobileToolsOpen && createPortal(
              <aside
                ref={mobileToolsPanelRef}
                role="dialog"
                aria-label="页面工具"
                tabIndex={-1}
                className={`fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[200] flex h-auto max-h-[min(68dvh,36rem)] w-[min(86vw,22rem)] origin-right flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-2xl ring-1 ring-black/5 backdrop-blur-xl transition-[transform,opacity] duration-200 ease-out ${mobileToolsVisible ? 'translate-x-0 scale-100 opacity-100' : 'translate-x-[calc(100%+1rem)] scale-[.97] opacity-0'}`}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">页面工具</div>
                    <div className="mt-0.5 text-xs text-gray-500">搜索、筛选和页面操作</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeMobileTools}
                    aria-label="关闭页面工具"
                    title="关闭"
                    className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {hasPrimaryFilters && (
                    <section>
                      <h3 className="mb-1.5 text-xs font-semibold text-gray-500">搜索</h3>
                      <div className="[&>*]:!w-full [&>*]:!min-w-0 [&>*]:!max-w-none">
                        {primaryFilters}
                      </div>
                    </section>
                  )}
                  {hasFilters && (
                    <section className="border-t border-gray-100 pt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold text-gray-500">筛选条件</h3>
                        {filterCount > 0 && <span className="text-xs text-blue-600">已启用 {filterCount} 项</span>}
                      </div>
                      {filterContent}
                    </section>
                  )}
                  {hasPreferences && (
                    <section className="border-t border-gray-100 pt-3">
                      <h3 className="mb-1.5 text-xs font-semibold text-gray-500">布局</h3>
                      {preferences}
                    </section>
                  )}
                </div>
                {hasActions && (
                  <footer className="shrink-0 border-t border-gray-100 bg-gray-50/90 p-3">
                    <span className="sr-only">页面操作</span>
                    <div className="flex items-center gap-2 [&>button]:min-w-0 [&>button]:flex-1 [&>div]:shrink-0">
                      {actions}
                    </div>
                  </footer>
                )}
              </aside>,
              document.body,
          )}
        </div>
      )}
      {hasPrimaryFilters && (
        <div className="order-last hidden w-full min-w-0 flex-none flex-wrap items-center justify-start gap-2 overflow-visible sm:order-none sm:flex sm:w-auto sm:flex-[1_1_260px] xl:gap-3">
          {primaryFilters}
        </div>
      )}
      {hasFilters && (
        <div ref={filterRootRef} className="relative hidden min-w-0 shrink-0 items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => {
              setMenuOpen((open) => !open)
              setActionMenuOpen(false)
            }}
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
          {menuOpen && filterPresentation === 'popover' && (
            <div
              role="dialog"
              aria-label="筛选条件"
              className="absolute left-0 top-[calc(100%+8px)] z-[110] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl md:left-auto md:right-0"
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">筛选条件</div>
                  <div className="mt-0.5 text-xs text-gray-500">勾选后立即更新结果</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                >
                  完成
                </button>
              </div>
              <div className="max-h-[min(420px,60dvh)] overflow-y-auto p-3">
                {filterContent}
              </div>
            </div>
          )}
          {menuOpen && filterPresentation === 'dialog' && (
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
        <>
          <div className="hidden min-w-max shrink-0 flex-nowrap items-center justify-end gap-2 whitespace-nowrap lg:flex xl:gap-3">
            {actions}
          </div>
          <div className="order-first hidden sm:block lg:order-none lg:hidden">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={actionMenuOpen}
              onClick={() => {
                setActionMenuOpen(true)
                setMenuOpen(false)
              }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[13px] text-gray-600">⋯</span>
              工具
            </button>
            {actionMenuOpen && (
              <ModalOverlay
                onClose={() => setActionMenuOpen(false)}
                className="items-end pb-[calc(var(--mes-mobile-nav-offset)+0.75rem)]"
              >
                <div className="w-full max-w-sm overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">页面工具</div>
                    <button
                      type="button"
                      onClick={() => setActionMenuOpen(false)}
                      className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                    >
                      关闭
                    </button>
                  </div>
                  <div
                    className="grid max-h-[60dvh] gap-2 overflow-y-auto p-3 [&>button]:w-full [&>button]:justify-center [&>div]:w-full [&>div>div]:w-full [&>div>div]:justify-center"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button')) {
                        setActionMenuOpen(false)
                      }
                    }}
                  >
                    {actions}
                  </div>
                </div>
              </ModalOverlay>
            )}
          </div>
        </>
      )}
      {!hasActions && !hasFilters && !hasPrimaryFilters && (
        <div className="sr-only">无工具栏操作</div>
      )}
    </div>
  )
}
