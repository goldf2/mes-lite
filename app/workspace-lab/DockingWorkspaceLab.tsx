'use client'

import {
  ChevronLeft,
  ChevronRight,
  List,
  Menu,
  Plus,
  Search,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { DockZone, IconButton } from './components/WorkspaceChrome'
import { WorkspaceMain } from './components/WorkspaceMain'
import { FloatingToolWindow, LayoutMenu } from './components/WorkspaceOverlays'
import {
  NavigationContent,
  ToolContent,
  navigationGroups,
  panelLabels,
} from './components/WorkspacePanels'
import {
  cloneWorkspacePreference,
  defaultWorkspacePreference,
  detectWorkspacePreset,
  isWorkspacePreference,
  workspaceLabStorageKey,
  workspacePresets,
  type WorkspaceDockSide,
  type WorkspacePanelId,
  type WorkspacePanelPlacement,
  type WorkspacePreference,
} from './workspaceLab'

export default function DockingWorkspaceLab() {
  const [preference, setPreference] = useState<WorkspacePreference>(() => cloneWorkspacePreference(defaultWorkspacePreference))
  const [preferenceReady, setPreferenceReady] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [navigationPopupOpen, setNavigationPopupOpen] = useState(false)
  const [toolPopupOpen, setToolPopupOpen] = useState(false)
  const [draggingPanel, setDraggingPanel] = useState<WorkspacePanelId | null>(null)
  const [activeDockPanels, setActiveDockPanels] = useState<Record<WorkspaceDockSide, WorkspacePanelId>>({ left: 'navigation', right: 'tools' })
  const [activeNavigationGroup, setActiveNavigationGroup] = useState('documents')
  const [activeTool, setActiveTool] = useState('properties')
  const [selectedRecordId, setSelectedRecordId] = useState('WI-0001')
  const [keyword, setKeyword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(workspaceLabStorageKey) || 'null')
      if (isWorkspacePreference(stored)) setPreference(cloneWorkspacePreference(stored))
    } catch {
      // 实验偏好损坏时直接使用默认预设。
    }
    setPreferenceReady(true)
  }, [])

  useEffect(() => {
    if (!preferenceReady) return
    window.localStorage.setItem(workspaceLabStorageKey, JSON.stringify(preference))
  }, [preference, preferenceReady])

  const leftPanels = useMemo(() => (['navigation', 'tools'] as WorkspacePanelId[]).filter((panel) => preference.placements[panel] === 'left'), [preference.placements])
  const rightPanels = useMemo(() => (['navigation', 'tools'] as WorkspacePanelId[]).filter((panel) => preference.placements[panel] === 'right'), [preference.placements])
  const presetKey = detectWorkspacePreset(preference)
  const presetLabel = workspacePresets.find((preset) => preset.key === presetKey)?.label || '自定义'

  const showMessage = (nextMessage: string) => {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 2200)
  }

  const placePanel = (panelId: WorkspacePanelId, placement: WorkspacePanelPlacement) => {
    setPreference((current) => ({ ...current, placements: { ...current.placements, [panelId]: placement } }))
    if (placement === 'left' || placement === 'right') {
      setActiveDockPanels((current) => ({ ...current, [placement]: panelId }))
    }
    if (panelId === 'navigation' && placement !== 'popup') setNavigationPopupOpen(false)
    if (panelId === 'tools' && placement !== 'popup') setToolPopupOpen(false)
    showMessage(`${panelLabels[panelId]}已${placement === 'popup' ? '改为弹窗呼出' : `停靠到${placement === 'left' ? '左侧' : '右侧'}`}`)
  }

  const startPanelDrag = (event: DragEvent<HTMLButtonElement>, panelId: WorkspacePanelId) => {
    setDraggingPanel(panelId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', panelId)
  }

  const dropPanel = (side: WorkspaceDockSide) => {
    if (!draggingPanel) return
    placePanel(draggingPanel, side)
    setDraggingPanel(null)
  }

  const renderPanel = (panel: WorkspacePanelId) => panel === 'navigation'
    ? <NavigationContent activeGroup={activeNavigationGroup} onActiveGroupChange={setActiveNavigationGroup} onNavigate={(label) => showMessage(`已选择“${label}”（实验页不跳转）`)} />
    : <ToolContent activeTool={activeTool} onActiveToolChange={setActiveTool} />

  const openNavigation = () => {
    setNavigationPopupOpen(true)
    setLayoutMenuOpen(false)
  }

  const openTools = () => {
    setToolPopupOpen(true)
    setLayoutMenuOpen(false)
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-100 text-slate-900">
      <div className="flex h-full min-w-0 overflow-hidden">
        {leftPanels.length > 0 && (
          <DockZone
            side="left"
            width={preference.leftWidth}
            panels={leftPanels}
            activePanel={activeDockPanels.left}
            onActivePanelChange={(panel) => setActiveDockPanels((current) => ({ ...current, left: panel }))}
            onPlace={placePanel}
            onDragStart={startPanelDrag}
            onDragEnd={() => setDraggingPanel(null)}
            onDropPanel={dropPanel}
            renderPanel={renderPanel}
          />
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {preference.topNavigation && (
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm">M</div>
                <div className="hidden sm:block"><div className="text-sm font-bold text-slate-900">MES-lite</div><div className="text-[10px] text-slate-400">工作区实验</div></div>
              </div>
              <div className={preference.placements.navigation === 'popup' ? '' : 'xl:hidden'}>
                <button type="button" onClick={openNavigation} className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Menu className="h-4 w-4" />导航</button>
              </div>
              <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden lg:flex">
                {navigationGroups.map((group) => (
                  <button key={group.key} type="button" onClick={() => setActiveNavigationGroup(group.key)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${activeNavigationGroup === group.key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{group.label}</button>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                {!preference.topToolbar && (
                  <div className={preference.placements.tools === 'popup' ? '' : 'xl:hidden'}>
                    <IconButton label="打开工具" onClick={openTools}><Wrench className="h-4 w-4" /></IconButton>
                  </div>
                )}
                <IconButton label="工作区布局" onClick={() => setLayoutMenuOpen(true)} active={layoutMenuOpen}><Settings2 className="h-4 w-4" /></IconButton>
              </div>
            </header>
          )}

          {preference.topToolbar && (
            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
              {!preference.topNavigation && (
                <div className={preference.placements.navigation === 'popup' ? '' : 'xl:hidden'}>
                  <IconButton label="打开双列导航" onClick={openNavigation}><Menu className="h-4 w-4" /></IconButton>
                </div>
              )}
              <label className="flex h-10 min-w-0 max-w-xl flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-300 focus-within:bg-white">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="搜索文档编号、标题或类别" />
                <span className="hidden rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 sm:inline">智能</span>
              </label>
              <div className="ml-auto flex items-center gap-2">
                <IconButton label="高级搜索" onClick={() => showMessage('高级搜索入口（演示）')}><Search className="h-4 w-4" /></IconButton>
                <IconButton label="列表视图" onClick={() => showMessage('视图切换入口（演示）')}><List className="h-4 w-4" /></IconButton>
                <div className={preference.placements.tools === 'popup' ? '' : 'xl:hidden'}>
                  <IconButton label="打开工具弹窗" onClick={openTools}><Wrench className="h-4 w-4" /></IconButton>
                </div>
                {!preference.topNavigation && <IconButton label="工作区布局" onClick={() => setLayoutMenuOpen(true)} active={layoutMenuOpen}><Settings2 className="h-4 w-4" /></IconButton>}
                <button type="button" onClick={() => showMessage('新建入口（演示）')} className="hidden h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 sm:flex"><Plus className="h-4 w-4" />新建</button>
              </div>
            </div>
          )}

          <WorkspaceMain keyword={keyword} selectedId={selectedRecordId} onSelectedIdChange={setSelectedRecordId} />
        </section>

        {rightPanels.length > 0 && (
          <DockZone
            side="right"
            width={preference.rightWidth}
            panels={rightPanels}
            activePanel={activeDockPanels.right}
            onActivePanelChange={(panel) => setActiveDockPanels((current) => ({ ...current, right: panel }))}
            onPlace={placePanel}
            onDragStart={startPanelDrag}
            onDragEnd={() => setDraggingPanel(null)}
            onDropPanel={dropPanel}
            renderPanel={renderPanel}
          />
        )}
      </div>

      {!preference.topNavigation && !preference.topToolbar && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
          <div className={preference.placements.navigation === 'popup' ? '' : 'xl:hidden'}><IconButton label="打开导航" onClick={openNavigation}><Menu className="h-4 w-4" /></IconButton></div>
          <div className={preference.placements.tools === 'popup' ? '' : 'xl:hidden'}><IconButton label="打开工具" onClick={openTools}><Wrench className="h-4 w-4" /></IconButton></div>
          <IconButton label="工作区布局" onClick={() => setLayoutMenuOpen(true)} active={layoutMenuOpen}><Settings2 className="h-4 w-4" /></IconButton>
        </div>
      )}

      {draggingPanel && (
        <>
          <div
            className="fixed inset-y-4 left-4 z-[100] flex w-[min(220px,24vw)] items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-blue-500/10 text-sm font-bold text-blue-700 backdrop-blur-sm"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); dropPanel('left') }}
          >
            <ChevronLeft className="mr-2 h-5 w-5" />停靠到左侧
          </div>
          <div
            className="fixed inset-y-4 right-4 z-[100] flex w-[min(220px,24vw)] items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-blue-500/10 text-sm font-bold text-blue-700 backdrop-blur-sm"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); dropPanel('right') }}
          >
            停靠到右侧<ChevronRight className="ml-2 h-5 w-5" />
          </div>
        </>
      )}

      {layoutMenuOpen && (
        <LayoutMenu
          preference={preference}
          onPreferenceChange={setPreference}
          onApplyPreset={(index) => setPreference(cloneWorkspacePreference(workspacePresets[index].preference))}
          onClose={() => setLayoutMenuOpen(false)}
        />
      )}

      {navigationPopupOpen && (
        <div className="fixed inset-0 z-[75] bg-slate-950/20 p-3 backdrop-blur-[2px]" onMouseDown={() => setNavigationPopupOpen(false)}>
          <div className="mt-14 w-[min(520px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div><div className="text-sm font-bold text-slate-900">功能导航</div><div className="mt-0.5 text-[11px] text-slate-400">一级菜单与二级功能</div></div>
              <button type="button" aria-label="关闭导航" onClick={() => setNavigationPopupOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <NavigationContent
              compact
              activeGroup={activeNavigationGroup}
              onActiveGroupChange={setActiveNavigationGroup}
              onNavigate={(label) => {
                setNavigationPopupOpen(false)
                showMessage(`已选择“${label}”（实验页不跳转）`)
              }}
            />
          </div>
        </div>
      )}

      {toolPopupOpen && (
        <FloatingToolWindow onClose={() => setToolPopupOpen(false)} activeTool={activeTool} onActiveToolChange={setActiveTool} />
      )}

      {message && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {message}
        </div>
      )}

      <div className="pointer-events-none fixed bottom-4 right-4 z-40 hidden rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur md:block">
        {presetLabel} · 本机自动保存
      </div>
    </div>
  )
}
