'use client'

import { LayoutList, PanelRightOpen, QrCode, SearchCheck, Settings2, X } from 'lucide-react'
import { ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ModalOverlay from './ModalOverlay'
import ToolbarOrderSettings, { useShowUnavailableToolbarSlots, useToolbarOrder, type ToolbarSlot } from './ToolbarOrderSettings'
import { PageModuleKeyContext } from './page-modules/PageModuleBoundary'
import ControlTooltip from './ControlTooltip'
import useCompactViewport from './useCompactViewport'
import { useWorkspaceLayoutPreference } from './interfacePreferences'

interface ResponsiveToolbarActionsProps {
  primaryFilters?: ReactNode
  advancedSearch?: ReactNode
  filterCount?: number
  filterSummary?: ReactNode
  preferences?: ReactNode
  viewControl?: ReactNode
  actions?: ReactNode
  pageKey?: string
  onOpenPageOptions?: () => void
}

export default function ResponsiveToolbarActions({ primaryFilters, advancedSearch, filterCount = 0, filterSummary, preferences, viewControl, actions, pageKey, onOpenPageOptions }: ResponsiveToolbarActionsProps) {
  const contextPageKey = useContext(PageModuleKeyContext)
  const [workspaceLayoutPreference] = useWorkspaceLayoutPreference()
  const compactViewport = useCompactViewport(1023)
  const resolvedPageKey = pageKey || contextPageKey
  const toolbarOrder = useToolbarOrder(resolvedPageKey)
  const showUnavailableSlots = useShowUnavailableToolbarSlots(resolvedPageKey)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [pageOptionsOpen, setPageOptionsOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [mobileToolsVisible, setMobileToolsVisible] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const mobileToolsPanelRef = useRef<HTMLElement | null>(null)
  const directAdvancedSearch = advancedSearch !== null && advancedSearch !== undefined && advancedSearch !== false ? advancedSearch : null
  const hasPrimaryFilters = primaryFilters !== null && primaryFilters !== undefined && primaryFilters !== false
  const hasAdvancedSearch = Boolean(directAdvancedSearch)
  const hasPreferences = preferences !== null && preferences !== undefined && preferences !== false
  const hasViewControl = viewControl !== null && viewControl !== undefined && viewControl !== false
  const hasActions = actions !== null && actions !== undefined && actions !== false
  const hasAnyTools = true
  const slotOrder = (slot: ToolbarSlot) => toolbarOrder.indexOf(slot)

  const openPageOptions = () => {
    if (onOpenPageOptions) onOpenPageOptions()
    else setPageOptionsOpen(true)
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
    setActionMenuOpen(false)
  }

  const closeMobileTools = () => {
    setMobileToolsVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setMobileToolsOpen(false)
      closeTimerRef.current = null
    }, 220)
  }

  const openPageQrCode = () => {
    setActionMenuOpen(false)
    if (mobileToolsOpen) closeMobileTools()
    window.dispatchEvent(new CustomEvent('mes:open-page-qr-code'))
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
    <button type="button" disabled aria-label="当前页面无高级搜索" className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-300 disabled:cursor-not-allowed"><SearchCheck className="h-4 w-4" /><ControlTooltip label="当前页面无高级搜索" /></button>
  )
  const disabledView = (
    <button type="button" disabled aria-label="当前页面无可切换视图" className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-300 disabled:cursor-not-allowed"><LayoutList className="h-4 w-4" /><ControlTooltip label="当前页面无可切换视图" /></button>
  )
  const pageOptionsButton = (
    <button type="button" onClick={openPageOptions} aria-label="页内选项" className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900"><Settings2 className="h-4 w-4" /><ControlTooltip label="页内选项" hidden={pageOptionsOpen} /></button>
  )

  const advancedControl = directAdvancedSearch || disabledAdvanced

  const toolPanelFilterSection = (hasAdvancedSearch || showUnavailableSlots) && (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <SearchCheck className="h-4 w-4 text-blue-600" />
          筛选条件
          {filterCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{filterCount} 项</span>}
        </div>
        <span className="text-[11px] text-gray-400">实时更新</span>
      </div>
      {hasAdvancedSearch ? (
        <div className="grid gap-2 [&>*]:!w-full [&>*]:!min-w-0 [&>*]:!max-w-none">
          {directAdvancedSearch}
          {filterSummary && <div className="sr-only">{filterSummary}</div>}
        </div>
      ) : <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">当前页面无高级搜索</div>}
    </section>
  )

  const toolPanelViewSection = (hasViewControl || showUnavailableSlots) && (
    <section className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <LayoutList className="h-4 w-4 shrink-0 text-blue-600" />
        <div><div className="text-sm font-semibold text-gray-900">显示方式</div><div className="text-[11px] text-gray-400">切换当前内容视图</div></div>
      </div>
      <div className="shrink-0">{hasViewControl ? viewControl : disabledView}</div>
    </section>
  )

  const toolPanelUtilities = (
    <section>
      <div className="mb-2 text-xs font-semibold text-gray-500">页面功能</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { if (mobileToolsOpen) closeMobileTools(); openPageOptions() }} className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm font-medium text-gray-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Settings2 className="h-4 w-4 shrink-0" />页内选项</button>
        <button type="button" onClick={openPageQrCode} className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm font-medium text-gray-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><QrCode className="h-4 w-4 shrink-0" />页面二维码</button>
      </div>
    </section>
  )

  const pageOptionsDialog = pageOptionsOpen && createPortal(
    <ModalOverlay onClose={() => setPageOptionsOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="页内选项" className="w-[min(92vw,30rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-base font-semibold text-gray-900">页内选项</div><div className="mt-0.5 text-xs text-gray-500">调整当前页面顶部工具顺序</div></div><button type="button" onClick={() => setPageOptionsOpen(false)} aria-label="关闭页内选项" className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
        <div className="p-4"><ToolbarOrderSettings pageKey={resolvedPageKey} /></div>
        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-4 py-3"><button type="button" onClick={() => setPageOptionsOpen(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">完成</button></div>
      </div>
    </ModalOverlay>, document.body,
  )

  if (workspaceLayoutPreference.layout === 'canvas' && !compactViewport) {
    return (
      <>
        <div className="flex h-full min-h-0 w-full flex-col bg-gray-50/80">
          <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
            <div className="text-base font-semibold text-gray-900">页面工具</div>
            <div className="mt-0.5 text-xs text-gray-500">搜索、显示与当前页面操作</div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
            {(hasPrimaryFilters || showUnavailableSlots) && (
              <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-2 text-xs font-semibold text-gray-500">页面搜索</div>
                <div className="min-w-0 [&>*]:!w-full [&>*]:!max-w-none">{hasPrimaryFilters ? primaryFilters : disabledSearch}</div>
              </section>
            )}
            {toolPanelFilterSection}
            {toolPanelViewSection}
            {hasPreferences && <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">{preferences}</section>}
            {toolPanelUtilities}
          </div>
          {hasActions && <footer className="shrink-0 border-t border-gray-200 bg-white p-3"><div className="grid gap-2 [&>button]:w-full [&>button]:justify-center">{actions}</div></footer>}
        </div>
        {pageOptionsDialog}
      </>
    )
  }

  return (
    <>
    <div className="relative flex w-full min-w-0 flex-nowrap items-center gap-2 xl:gap-3">
      {(hasPrimaryFilters || showUnavailableSlots) && <div className="flex min-w-0 flex-1 items-center sm:hidden [&>*]:!min-w-0 [&>*]:!max-w-none">{hasPrimaryFilters ? primaryFilters : disabledSearch}</div>}
      {hasAnyTools && (
        <div className="shrink-0 sm:hidden">
          <button type="button" aria-haspopup="dialog" aria-expanded={mobileToolsOpen} aria-label="页面工具" onClick={mobileToolsOpen ? closeMobileTools : openMobileTools} className={`relative inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm shadow-sm transition ${mobileToolsOpen ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            <PanelRightOpen aria-hidden="true" size={18} className={`transition-transform duration-200 ${mobileToolsOpen ? 'rotate-180' : ''}`} />
            <span className="max-[420px]:sr-only">工具</span>
            {filterCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 text-white ring-2 ring-white">{filterCount}</span>}
          </button>
          {mobileToolsOpen && createPortal(
            <aside ref={mobileToolsPanelRef} role="dialog" aria-label="页面工具" tabIndex={-1} className={`fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[200] flex h-auto max-h-[calc(100dvh-1.5rem)] w-[min(92vw,28rem)] origin-right flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-2xl backdrop-blur-xl transition-[transform,opacity] duration-200 ${mobileToolsVisible ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+1rem)] opacity-0'}`}>
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-base font-semibold text-gray-900">页面工具</div><div className="mt-0.5 text-xs text-gray-500">筛选、显示与页面操作</div></div><button type="button" onClick={closeMobileTools} aria-label="关闭页面工具" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50/80 p-3 [scrollbar-width:thin]">
                {toolPanelFilterSection}
                {toolPanelViewSection}
                {hasPreferences && <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">{preferences}</section>}
                {toolPanelUtilities}
              </div>
              {hasActions && <footer className="shrink-0 border-t border-gray-100 bg-white p-3"><div className="grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:justify-center">{actions}</div></footer>}
            </aside>, document.body,
          )}
        </div>
      )}

      {((hasPrimaryFilters || showUnavailableSlots) || (hasAdvancedSearch || showUnavailableSlots)) && (
        <div className="mr-auto hidden min-w-0 max-w-[680px] flex-1 items-center gap-2 sm:flex">
          {(hasPrimaryFilters || showUnavailableSlots) && <div className="min-w-0 flex-1">{hasPrimaryFilters ? primaryFilters : disabledSearch}</div>}
          {(hasAdvancedSearch || showUnavailableSlots) && <div className="hidden shrink-0 xl:block">{advancedControl}</div>}
        </div>
      )}
      {(hasViewControl || showUnavailableSlots) && <div style={{ order: slotOrder('view') }} className="hidden shrink-0 xl:block">{hasViewControl ? viewControl : disabledView}</div>}
      <div style={{ order: slotOrder('options') }} className="hidden shrink-0 xl:block">{pageOptionsButton}</div>

      {hasAnyTools && (
        <div style={{ order: slotOrder('actions') }} className="hidden min-w-max shrink-0 items-center gap-2 sm:flex">
          {hasActions && <div className="hidden items-center gap-2 xl:flex">{actions}</div>}
          <div className="xl:hidden">
            <button type="button" aria-haspopup="dialog" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm"><span>⋯</span>工具</button>
            {actionMenuOpen && <ModalOverlay onClose={() => setActionMenuOpen(false)} className="items-end pb-[calc(var(--mes-mobile-nav-offset)+0.75rem)] lg:items-center lg:pb-0"><div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"><div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-base font-semibold text-gray-900">页面工具</div><div className="mt-0.5 text-xs text-gray-500">筛选、显示与页面操作</div></div><button type="button" onClick={() => setActionMenuOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50/80 p-3 [scrollbar-width:thin]">{toolPanelFilterSection}{toolPanelViewSection}{hasPreferences && <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">{preferences}</section>}{toolPanelUtilities}</div>{hasActions && <footer className="shrink-0 border-t border-gray-100 bg-white p-3"><div className="grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:justify-center">{actions}</div></footer>}</div></ModalOverlay>}
          </div>
        </div>
      )}

    </div>
    {pageOptionsDialog}
    </>
  )
}
