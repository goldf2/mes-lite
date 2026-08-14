'use client'

// 应用壳实现；业务垂直切片通过 modules/<domain> 的公开入口挂载。

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { CircleHelp, Menu, PanelLeftOpen, PanelRightOpen, Pin, PinOff, X } from 'lucide-react'
import AuthGate, { CurrentOperator } from './components/AuthGate'
import ResponsiveToolbarActions from './components/ResponsiveToolbarActions'
import { InterfacePreferenceSync } from './components/interfacePreferences'
import AiAssistantMark from './components/AiAssistantMark'
import TopBarPortal from './components/TopBarPortal'
import DesktopNavigation from './components/navigation/DesktopNavigation'
import DesktopTopNavigation from './components/navigation/DesktopTopNavigation'
import MobileSiblingNavigation from './components/navigation/MobileSiblingNavigation'
import WorkspaceDomainTabs from './components/navigation/WorkspaceDomainTabs'
import PageQrCodeButton from './components/PageQrCodeButton'
import ControlTooltip from './components/ControlTooltip'
import dynamic from 'next/dynamic'
import {
  AccountMenu,
  NavigationGlyph,
  WorkspacePageHost,
  compactNavigationLabel,
  useApplicationNavigationController,
  useDesktopNavigationController,
  useWorkspacePreferenceController,
} from './components/shell'

const AiAssistantPanel = dynamic(() => import('./components/AiAssistantPanel'))
const SopHelpDrawer = dynamic(() => import('@/modules/sop').then((module) => module.SopHelpDrawer))

// ==================== 状态映射 ====================

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'

// ==================== 主组件 ====================

export default function Home() {
  return (
    <AuthGate>
      {(operator, onLogout) => <HomeApp operator={operator} onLogout={onLogout} />}
    </AuthGate>
  )
}

function HomeApp({ operator, onLogout }: { operator: CurrentOperator; onLogout: () => void }) {
  const [message, setMessage] = useState('')
  const showMessage = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 5000)
  }, [])
  const {
    workspacePreference,
    saveWorkspacePreference,
    recordWorkspaceUsage,
  } = useWorkspacePreferenceController({ onError: showMessage })
  const [productionOrderStateSummary, setProductionOrderStateSummary] = useState('页面：生产订单')
  const [stockStateSummary, setStockStateSummary] = useState('页面：库存管理')
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [sopHelpOpen, setSopHelpOpen] = useState(false)
  const {
    desktopNavigationMode,
    desktopNavigationDisplayMode,
    workspaceLayoutPreference,
    siblingNavigationEnabled,
    transientNavigationOpen,
    sidebarWidth,
    splitSidebarWidth,
    resizing,
    autoHideDesktopNavigation,
    persistentDesktopNavigation,
    splitNavigationVisible,
    sidebarResizeMin,
    sidebarResizeMax,
    sidebarResizeValue,
    panelRef: desktopNavigationPanelRef,
    triggerRef: desktopNavigationTriggerRef,
    cancelOpen: cancelDesktopNavigationOpen,
    openTransientNavigation: openTransientDesktopNavigation,
    scheduleOpen: scheduleDesktopNavigationOpen,
    scheduleClose: scheduleDesktopNavigationClose,
    toggleTransientNavigation,
    closeTransientNavigation: closeTransientDesktopNavigation,
    toggleWorkspaceLayout,
    toggleNavigationBehavior,
    handleSidebarResizePointerDown,
    resetSidebarWidth,
    handleSidebarResizeKeyDown,
  } = useDesktopNavigationController()
  const closeSystemMenu = useCallback(() => setSystemMenuOpen(false), [])
  const {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    workspaceNavigationConfig,
    activeWorkspace,
    workspaceFunctionItems,
    tab,
    setTab,
    bomEditorTarget,
    openBomEditor,
    clearBomEditorTarget,
    pageContentRef,
    pageLocationKey,
    activeTabLabel,
    activePageModule,
    activeFunctionPath,
    navigationGroups,
    activeNavigationGroup,
    mobilePrimaryItems,
    mobileNavOpen,
    setMobileNavOpen,
    openWorkspaceFunction,
    navigateToTab,
    changeWorkspace,
  } = useApplicationNavigationController({
    operator,
    closeSystemMenu,
    closeTransientNavigation: closeTransientDesktopNavigation,
    recordWorkspaceUsage,
  })
  const systemMenuRef = useRef<HTMLDivElement>(null)
  const desktopSystemMenuRef = useRef<HTMLDivElement>(null)
  const activeStateSummary = tab === 'orders' || tab === 'create' || tab === 'detail'
    ? productionOrderStateSummary
    : tab === 'stocks'
      ? stockStateSummary
      : tab === 'materials'
        ? `子页面：${activeTabLabel}`
        : `页面：${activeTabLabel}`
  useEffect(() => {
    if (!systemMenuOpen) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (systemMenuRef.current?.contains(target) || desktopSystemMenuRef.current?.contains(target)) return
      setSystemMenuOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSystemMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [systemMenuOpen])

  useEffect(() => {
    if (!systemMenuOpen) return
    if (window.matchMedia('(min-width: 1024px)').matches) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [systemMenuOpen])

  const closeAiAssistant = useCallback(() => {
    setAiAssistantOpen(false)
  }, [])

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-gray-50"
      data-desktop-navigation={desktopNavigationMode}
      data-workspace-layout={workspaceLayoutPreference.layout}
      data-desktop-navigation-behavior={workspaceLayoutPreference.navigationBehavior}
      data-navigation-workspace={activeWorkspace}
      style={{
        '--mes-desktop-sidebar-width': `${sidebarWidth}px`,
        '--mes-desktop-split-sidebar-width': `${splitSidebarWidth}px`,
        '--mes-desktop-tools-width': '320px',
      } as CSSProperties}
    >
      <InterfacePreferenceSync />
      <header className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center border-b border-gray-200 bg-white lg:flex">
        <div className={`flex h-full shrink-0 items-center border-r border-gray-200 ${
          workspaceLayoutPreference.layout === 'canvas'
            ? 'w-44 gap-3 px-4'
            : persistentDesktopNavigation
              ? `w-[var(--mes-desktop-sidebar-width)] gap-3 px-4 ${desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''}`
              : 'w-16 justify-center px-2'
        }`}>
          {autoHideDesktopNavigation ? (
            <button
              ref={desktopNavigationTriggerRef}
              type="button"
              aria-label={transientNavigationOpen ? '收起功能导航' : '打开功能导航'}
              aria-expanded={transientNavigationOpen}
              onPointerEnter={scheduleDesktopNavigationOpen}
              onPointerLeave={cancelDesktopNavigationOpen}
              onFocus={scheduleDesktopNavigationOpen}
              onClick={toggleTransientNavigation}
              className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
              <ControlTooltip label={transientNavigationOpen ? '收起功能导航' : '打开功能导航'} hidden={transientNavigationOpen} />
            </button>
          ) : (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-lg font-bold text-white">M</span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-gray-800">MES-lite</h1>
                <p className="truncate text-[11px] text-gray-500">生产系统 · v{appVersion}</p>
              </div>
            </>
          )}
        </div>
        {workspaceLayoutPreference.layout === 'canvas' && (
          <div className="w-48 shrink-0 border-r border-gray-100 px-2">
            <WorkspaceDomainTabs
              config={workspaceNavigationConfig}
              value={activeWorkspace}
              onChange={changeWorkspace}
              compact
            />
          </div>
        )}
        {workspaceLayoutPreference.layout === 'canvas' && <DesktopTopNavigation groups={navigationGroups} />}
        <div
          id="topbar-actions-desktop"
          aria-label="页面搜索、筛选和工具"
          className={`${workspaceLayoutPreference.layout === 'sidebar' ? 'flex' : 'hidden'} min-w-0 flex-1 items-center gap-3 overflow-visible px-4 empty:before:content-['']`}
        />
        <div className="flex h-full shrink-0 items-center gap-2 border-l border-gray-100 px-4">
          <button
            type="button"
            aria-label={`打开${activeTabLabel}操作帮助`}
            onClick={() => setSopHelpOpen(true)}
            className="group relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-blue-50 hover:text-blue-700"
          >
            <CircleHelp aria-hidden="true" className="h-5 w-5" />
            <ControlTooltip label="当前页面操作帮助" hidden={sopHelpOpen} />
          </button>
          <button
            type="button"
            aria-label={workspaceLayoutPreference.layout === 'canvas' ? '切换到标准管理布局' : '切换到画布工作布局'}
            onClick={toggleWorkspaceLayout}
            className="group relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-blue-700"
          >
            {workspaceLayoutPreference.layout === 'canvas'
              ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
              : <PanelRightOpen aria-hidden="true" className="h-5 w-5" />}
            <ControlTooltip label={workspaceLayoutPreference.layout === 'canvas' ? '切换到标准管理布局' : '切换到画布工作布局'} />
          </button>
          {canRead('aiAssistant') && (
            <button
              type="button"
              onClick={() => {
                setAiAssistantOpen(true)
                setSystemMenuOpen(false)
              }}
              aria-label="打开 AI 协作助手"
              className="mes-ai-assistant-trigger group relative flex h-12 w-12 items-center justify-center rounded-full bg-transparent p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <AiAssistantMark animated priority className="h-11 w-11" />
              <ControlTooltip label="打开 AI 助手" hidden={aiAssistantOpen} />
            </button>
          )}
          <PageQrCodeButton
            pageTitle={activeTabLabel}
            functionPath={activeFunctionPath}
            stateSummary={activeStateSummary}
            compact
            triggerClassName="hidden xl:flex"
            listenForGlobalOpen
          />
          <AccountMenu
            containerRef={desktopSystemMenuRef}
            operator={operator}
            appVersion={appVersion}
            open={systemMenuOpen}
            onToggle={() => setSystemMenuOpen((open) => !open)}
            onLogout={() => {
              setSystemMenuOpen(false)
              onLogout()
            }}
          />
        </div>
      </header>

      <div
        id="page-tools-desktop"
        aria-label="右侧页面工具"
        className={`fixed bottom-0 right-0 top-16 z-30 hidden w-[var(--mes-desktop-tools-width)] border-l border-gray-200 bg-white ${workspaceLayoutPreference.layout === 'canvas' ? 'lg:flex' : 'lg:hidden'}`}
      />

      {autoHideDesktopNavigation && !transientNavigationOpen && (
        <div aria-hidden="true" onPointerEnter={scheduleDesktopNavigationOpen} onPointerLeave={cancelDesktopNavigationOpen} className="fixed bottom-0 left-0 top-16 z-30 hidden w-2 lg:block" />
      )}

      <aside
        ref={desktopNavigationPanelRef}
        onPointerEnter={autoHideDesktopNavigation ? openTransientDesktopNavigation : undefined}
        onPointerLeave={autoHideDesktopNavigation ? scheduleDesktopNavigationClose : undefined}
        onFocusCapture={autoHideDesktopNavigation ? openTransientDesktopNavigation : undefined}
        onBlurCapture={autoHideDesktopNavigation ? scheduleDesktopNavigationClose : undefined}
        className={`fixed bottom-0 left-0 top-16 hidden w-[var(--mes-desktop-sidebar-width)] flex-col border-r border-gray-200 bg-white transition-transform duration-200 motion-reduce:transition-none lg:flex ${
          desktopNavigationMode === 'split' ? 'xl:w-[var(--mes-desktop-split-sidebar-width)]' : ''
        } ${workspaceLayoutPreference.layout === 'canvas'
          ? 'lg:hidden'
          : autoHideDesktopNavigation
            ? `z-40 shadow-2xl ${transientNavigationOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'z-30 translate-x-0'
        }`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-100 px-2">
          <div className="min-w-0 flex-1">
            <WorkspaceDomainTabs
              config={workspaceNavigationConfig}
              value={activeWorkspace}
              onChange={changeWorkspace}
              compact
            />
          </div>
          <button
            type="button"
            aria-label={autoHideDesktopNavigation ? '固定导航' : '改为自动隐藏'}
            onClick={toggleNavigationBehavior}
            className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            {autoHideDesktopNavigation ? <Pin aria-hidden="true" className="h-4 w-4" /> : <PinOff aria-hidden="true" className="h-4 w-4" />}
            <ControlTooltip label={autoHideDesktopNavigation ? '固定导航' : '改为自动隐藏'} />
          </button>
        </div>
        <DesktopNavigation mode={desktopNavigationMode} groups={navigationGroups} displayMode={desktopNavigationDisplayMode} />
        <div
          role="separator"
          aria-label="调整左侧辅助功能区宽度"
          aria-orientation="vertical"
          aria-valuemin={sidebarResizeMin}
          aria-valuemax={sidebarResizeMax}
          aria-valuenow={Math.round(sidebarResizeValue)}
          tabIndex={0}
          onPointerDown={handleSidebarResizePointerDown}
          onDoubleClick={resetSidebarWidth}
          onKeyDown={handleSidebarResizeKeyDown}
          className={`group absolute inset-y-0 right-0 flex w-3 translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none ${
            resizing ? 'bg-blue-50/70' : ''
          }`}
          title="拖动调整左侧宽度，双击恢复默认"
        >
          <span className={`h-20 w-1 rounded-full transition ${
            resizing
              ? 'bg-blue-500'
              : 'bg-gray-300 group-hover:bg-blue-400 group-focus:bg-blue-500'
          }`} />
        </div>
      </aside>

      <main className={`mes-mobile-main min-w-0 p-3 sm:p-4 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:p-6 lg:pb-0 lg:pt-20 ${
        persistentDesktopNavigation
          ? `lg:ml-[var(--mes-desktop-sidebar-width)] ${desktopNavigationMode === 'split' ? 'xl:ml-[var(--mes-desktop-split-sidebar-width)]' : ''}`
          : 'lg:ml-0'
      } ${workspaceLayoutPreference.layout === 'canvas' ? 'lg:mr-[var(--mes-desktop-tools-width)]' : 'lg:mr-0'}`}>
        <div className={`fixed inset-x-0 top-0 border-b border-gray-200 bg-gray-50/95 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] shadow-sm backdrop-blur sm:px-4 lg:hidden ${
          systemMenuOpen ? 'z-[60] lg:z-30' : 'z-30'
        }`}>
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <button
                type="button"
                aria-label="打开全部功能"
                aria-haspopup="dialog"
                aria-expanded={mobileNavOpen}
                onClick={() => {
                  setMobileNavOpen(true)
                  setSystemMenuOpen(false)
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </button>
              {siblingNavigationEnabled && <MobileSiblingNavigation group={activeNavigationGroup} />}
              <div id="topbar-actions-mobile" className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-visible empty:hidden" />
              <button
                type="button"
                aria-label={`打开${activeTabLabel}操作帮助`}
                onClick={() => setSopHelpOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-blue-50 hover:text-blue-700"
              >
                <CircleHelp aria-hidden="true" className="h-5 w-5" />
              </button>
              <AccountMenu
                containerRef={systemMenuRef}
                operator={operator}
                appVersion={appVersion}
                open={systemMenuOpen}
                onToggle={() => {
                  setSystemMenuOpen((open) => !open)
                  setMobileNavOpen(false)
                }}
                onLogout={() => {
                  setSystemMenuOpen(false)
                  onLogout()
                }}
                compact
              />
            </div>
            <TopBarPortal>
                {activePageModule.shellToolbarActions ? (
                  <ResponsiveToolbarActions pageKey={activePageModule.key} />
                ) : null}
            </TopBarPortal>
          </div>
        </div>

        <div
          ref={pageContentRef}
          aria-label="页面内容区"
          className="mes-page-content-scroll relative min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-scroll lg:overscroll-contain lg:pb-6 lg:[scrollbar-gutter:stable]"
        >
          <WorkspacePageHost
            definition={activePageModule}
            tab={tab}
            message={message}
            operator={operator}
            workspaceItems={workspaceFunctionItems}
            workspacePreference={workspacePreference}
            bomEditorTarget={bomEditorTarget}
            canRead={canRead}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onMessage={showMessage}
            onOpenWorkspaceFunction={openWorkspaceFunction}
            onOpenAllFunctions={() => navigateToTab('allFunctions')}
            onSaveWorkspacePreference={saveWorkspacePreference}
            onTabChange={setTab}
            onProductionOrderStateSummaryChange={setProductionOrderStateSummary}
            onStockStateSummaryChange={setStockStateSummary}
            onOpenBomEditor={openBomEditor}
            onBomEditorTargetHandled={clearBomEditorTarget}
          />
        </div>
      </main>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[70] mes-modal-overlay lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="全部功能"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,380px)] flex-col overflow-hidden border-r border-gray-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
              <div>
                <div className="text-base font-semibold text-gray-900">全部功能</div>
                <div className="mt-0.5 text-xs text-gray-500">MES-lite v{appVersion}</div>
              </div>
              <button
                type="button"
                aria-label="关闭全部功能"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="shrink-0 border-b border-gray-200 px-4 py-3">
              <WorkspaceDomainTabs
                config={workspaceNavigationConfig}
                value={activeWorkspace}
                onChange={changeWorkspace}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
              <DesktopNavigation
                mode="accordion"
                groups={navigationGroups}
                displayMode={desktopNavigationDisplayMode}
              />
            </div>
          </aside>
        </div>
      )}

      {canRead('aiAssistant') && (
        <AiAssistantPanel
          open={aiAssistantOpen}
          onClose={closeAiAssistant}
          onOpenSettings={() => {
            setAiAssistantOpen(false)
            navigateToTab('aiSettings')
          }}
          pageContext={{ key: pageLocationKey, label: activeTabLabel }}
          isAdmin={operator.role === 'ADMIN'}
        />
      )}

      {sopHelpOpen && (
        <SopHelpDrawer
          pageKey={activePageModule.key}
          pageLabel={activeTabLabel}
          onClose={() => setSopHelpOpen(false)}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(mobilePrimaryItems.length + (canRead('aiAssistant') ? 1 : 0), 1)}, minmax(0, 1fr))` }}
        >
          {mobilePrimaryItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                item.active ? 'bg-blue-600 text-white shadow-sm [&_span:first-child]:bg-white/15 [&_span:first-child]:text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <NavigationGlyph icon={item.key} />
              <span className="max-w-full truncate">{compactNavigationLabel(item.label)}</span>
            </button>
          ))}
          {canRead('aiAssistant') && (
            <button
              type="button"
              onClick={() => {
                setAiAssistantOpen(true)
                setSystemMenuOpen(false)
                setMobileNavOpen(false)
              }}
              aria-label="打开 AI 协作助手"
              className="mes-ai-assistant-trigger flex min-w-0 flex-col items-center justify-center gap-1 bg-transparent px-1 py-2 text-[11px] font-medium text-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            >
              <AiAssistantMark animated priority className="h-8 w-8" />
              <span className="max-w-full truncate">问 AI</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
