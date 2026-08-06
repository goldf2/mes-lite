'use client'

import { LayoutList, PanelRightOpen, SearchCheck, Settings2, X } from 'lucide-react'
import { ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MovableEdgeTrigger from './layout/MovableEdgeTrigger'
import ModalOverlay from './ModalOverlay'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import ToolbarOrderSettings, { useShowUnavailableToolbarSlots, useToolbarOrder, type ToolbarSlot } from './ToolbarOrderSettings'
import { PageModuleKeyContext } from './page-modules/PageModuleBoundary'

interface ResponsiveToolbarActionsProps {
  children?: ReactNode
  primaryFilters?: ReactNode
  advancedSearch?: ReactNode
  filters?: ReactNode
  filterCount?: number
  filterSummary?: ReactNode
  preferences?: ReactNode
  viewControl?: ReactNode
  actions?: ReactNode
  filterPresentation?: 'dialog' | 'popover'
  pageKey?: string
  onOpenPageOptions?: () => void
}

export default function ResponsiveToolbarActions({ children, primaryFilters, advancedSearch, filters, filterCount = 0, filterSummary, preferences, viewControl, actions, filterPresentation = 'dialog', pageKey, onOpenPageOptions }: ResponsiveToolbarActionsProps) {
  const contextPageKey = useContext(PageModuleKeyContext)
  const resolvedPageKey = pageKey || contextPageKey
  const toolbarOrder = useToolbarOrder(resolvedPageKey)
  const showUnavailableSlots = useShowUnavailableToolbarSlots(resolvedPageKey)
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [pageOptionsOpen, setPageOptionsOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [mobileToolsVisible, setMobileToolsVisible] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const mobileToolsPanelRef = useRef<HTMLElement | null>(null)
  const filterRootRef = useDismissibleSearchPopup<HTMLDivElement>(
    menuOpen && filterPresentation === 'popover',
    () => setMenuOpen(false)
  )
  const directAdvancedSearch = advancedSearch !== null && advancedSearch !== undefined && advancedSearch !== false ? advancedSearch : null
  const filterContent = filters ?? children
  const hasPrimaryFilters = primaryFilters !== null && primaryFilters !== undefined && primaryFilters !== false
  const hasLegacyAdvancedSearch = filterContent !== null && filterContent !== undefined && filterContent !== false
  const hasAdvancedSearch = Boolean(directAdvancedSearch) || hasLegacyAdvancedSearch
  const hasPreferences = preferences !== null && preferences !== undefined && preferences !== false
  const hasViewControl = viewControl !== null && viewControl !== undefined && viewControl !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false
  const hasAnyTools = true
  const slotOrder = (slot: ToolbarSlot) => toolbarOrder.indexOf(slot)

  const openPageOptions = () => {
    if (onOpenPageOptions) onOpenPageOptions()
    else setPageOptionsOpen(true)
    setMenuOpen(false)
    setActionMenuOpen(false)
  }

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

  const disabledSearch = (
    <input type="search" disabled aria-label="当前页面无可搜索列表" placeholder="当前页面无可搜索列表" className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-100 px-4 text-sm text-gray-400 disabled:cursor-not-allowed" />
  )
  const disabledAdvanced = (
    <button type="button" disabled aria-label="当前页面无高级搜索" title="当前页面无高级搜索" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-300 disabled:cursor-not-allowed"><SearchCheck className="h-4 w-4" /></button>
  )
  const disabledView = (
    <button type="button" disabled aria-label="当前页面无可切换视图" title="当前页面无可切换视图" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-300 disabled:cursor-not-allowed"><LayoutList className="h-4 w-4" /></button>
  )
  const pageOptionsButton = (
    <button type="button" onClick={openPageOptions} aria-label="页内选项" title="页内选项" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900"><Settings2 className="h-4 w-4" /></button>
  )

  const advancedControl = directAdvancedSearch || (hasLegacyAdvancedSearch ? (
    <div ref={filterRootRef} className="relative shrink-0">
      <button type="button" onClick={() => { setMenuOpen((open) => !open); setActionMenuOpen(false) }} aria-label="高级搜索" title="高级搜索" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-blue-700">
        <SearchCheck className="h-4 w-4" />
        {filterCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 text-white">{filterCount}</span>}
      </button>
      {filterSummary && <div className="sr-only">{filterSummary}</div>}
      {menuOpen && filterPresentation === 'popover' && (
        <div role="dialog" aria-label="高级搜索" className="absolute right-0 top-[calc(100%+8px)] z-[110] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-sm font-semibold text-gray-900">高级搜索</div><div className="mt-0.5 text-xs text-gray-500">组合条件会立即更新结果</div></div><button type="button" onClick={() => setMenuOpen(false)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
          <div className="max-h-[min(420px,60dvh)] overflow-y-auto p-3">{filterContent}</div>
        </div>
      )}
      {menuOpen && filterPresentation === 'dialog' && (
        <ModalOverlay onClose={() => setMenuOpen(false)}><div className="max-h-[calc(100vh-32px)] w-[min(calc(100vw-24px),560px)] overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-xl"><div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2"><div className="text-sm font-semibold text-gray-900">高级搜索</div><button type="button" onClick={() => setMenuOpen(false)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div><div className="flex max-h-[calc(100vh-112px)] flex-col gap-3 overflow-y-auto [&>*]:!max-w-full [&>*]:!flex-wrap">{filterContent}</div></div></ModalOverlay>
      )}
    </div>
  ) : disabledAdvanced)

  return (
    <div className="relative flex w-full min-w-0 flex-wrap items-center justify-start gap-2 xl:flex-nowrap xl:gap-3">
      {hasAnyTools && (
        <div className="ml-auto sm:hidden">
          <MovableEdgeTrigger edge="right" storageKey="mes-lite.edge-trigger.right.v1" label="呼出页面工具" active={mobileToolsOpen} onActivate={mobileToolsOpen ? closeMobileTools : openMobileTools} badge={filterCount > 0 ? filterCount : undefined} className="mes-dock-trigger-right"><PanelRightOpen aria-hidden="true" size={19} className={`transition-transform duration-200 ${mobileToolsOpen ? 'rotate-180' : ''}`} /></MovableEdgeTrigger>
          {mobileToolsOpen && createPortal(
            <aside ref={mobileToolsPanelRef} role="dialog" aria-label="页面工具" tabIndex={-1} className={`fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[200] flex h-auto max-h-[min(72dvh,40rem)] w-[min(88vw,24rem)] origin-right flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-2xl backdrop-blur-xl transition-[transform,opacity] duration-200 ${mobileToolsVisible ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+1rem)] opacity-0'}`}>
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5"><div><div className="text-sm font-semibold text-gray-900">页面工具</div><div className="mt-0.5 text-xs text-gray-500">搜索、视图与页面操作</div></div><button type="button" onClick={closeMobileTools} aria-label="关闭页面工具" className="rounded-md p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {(hasPrimaryFilters || showUnavailableSlots) && <section><h3 className="mb-1.5 text-xs font-semibold text-gray-500">搜索</h3><div className="[&>*]:!w-full [&>*]:!min-w-0 [&>*]:!max-w-none">{hasPrimaryFilters ? primaryFilters : disabledSearch}</div></section>}
                {(hasAdvancedSearch || showUnavailableSlots) && <section className="border-t border-gray-100 pt-3"><h3 className="mb-1.5 text-xs font-semibold text-gray-500">高级搜索</h3>{hasAdvancedSearch ? <div className="space-y-2">{directAdvancedSearch}{hasLegacyAdvancedSearch && filterContent}</div> : <div className="text-sm text-gray-400">当前页面无高级搜索</div>}</section>}
                {(hasViewControl || showUnavailableSlots) && <section className="border-t border-gray-100 pt-3"><h3 className="mb-1.5 text-xs font-semibold text-gray-500">视图</h3>{hasViewControl ? viewControl : <div className="text-sm text-gray-400">当前页面无可切换视图</div>}</section>}
                {hasPreferences && <section className="border-t border-gray-100 pt-3">{preferences}</section>}
                <section className="border-t border-gray-100 pt-3"><button type="button" onClick={openPageOptions} className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"><Settings2 className="h-4 w-4" />页内选项</button></section>
              </div>
              {hasActions && <footer className="border-t border-gray-100 bg-gray-50/90 p-3"><div className="flex flex-wrap gap-2">{actions}</div></footer>}
            </aside>, document.body,
          )}
        </div>
      )}

      {(hasPrimaryFilters || showUnavailableSlots) && <div style={{ order: slotOrder('search') }} className="hidden min-w-[220px] flex-[1_1_320px] items-center sm:flex">{hasPrimaryFilters ? primaryFilters : disabledSearch}</div>}
      {(hasAdvancedSearch || showUnavailableSlots) && <div style={{ order: slotOrder('advanced') }} className="hidden shrink-0 sm:block">{advancedControl}</div>}
      {(hasViewControl || showUnavailableSlots) && <div style={{ order: slotOrder('view') }} className="hidden shrink-0 sm:block">{hasViewControl ? viewControl : disabledView}</div>}
      <div style={{ order: slotOrder('options') }} className="hidden shrink-0 sm:block">{pageOptionsButton}</div>

      {hasActions && (
        <div style={{ order: slotOrder('actions') }} className="hidden min-w-max shrink-0 items-center gap-2 sm:flex">
          <div className="hidden items-center gap-2 xl:flex">{actions}</div>
          <div className="xl:hidden">
            <button type="button" aria-haspopup="dialog" aria-expanded={actionMenuOpen} onClick={() => { setActionMenuOpen(true); setMenuOpen(false) }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm"><span>⋯</span>工具</button>
            {actionMenuOpen && <ModalOverlay onClose={() => setActionMenuOpen(false)} className="items-end pb-[calc(var(--mes-mobile-nav-offset)+0.75rem)]"><div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div className="text-sm font-semibold text-gray-900">业务操作</div><button type="button" onClick={() => setActionMenuOpen(false)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div><div className="grid max-h-[60dvh] gap-2 overflow-y-auto p-3 [&>button]:w-full [&>button]:justify-center">{actions}</div></div></ModalOverlay>}
          </div>
        </div>
      )}

      {pageOptionsOpen && createPortal(
        <ModalOverlay onClose={() => setPageOptionsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="页内选项" className="w-[min(92vw,30rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-base font-semibold text-gray-900">页内选项</div><div className="mt-0.5 text-xs text-gray-500">调整当前页面顶部工具顺序</div></div><button type="button" onClick={() => setPageOptionsOpen(false)} aria-label="关闭页内选项" className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
            <div className="p-4"><ToolbarOrderSettings pageKey={resolvedPageKey} /></div>
            <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-4 py-3"><button type="button" onClick={() => setPageOptionsOpen(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">完成</button></div>
          </div>
        </ModalOverlay>, document.body,
      )}
    </div>
  )
}
