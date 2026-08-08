import { GripVertical, Move, PanelLeft, PanelRight } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
import type {
  WorkspaceDockSide,
  WorkspacePanelId,
  WorkspacePanelPlacement,
} from '../workspaceLab'
import { panelLabels } from './WorkspacePanels'

export function IconButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-slate-600 shadow-sm transition ${
        active
          ? 'border-blue-300 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

export function PanelPlacementControls({
  panelId,
  placement,
  onPlace,
}: {
  panelId: WorkspacePanelId
  placement: WorkspacePanelPlacement
  onPlace: (panelId: WorkspacePanelId, placement: WorkspacePanelPlacement) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`${panelLabels[panelId]}停靠到左侧`}
        title="停靠到左侧"
        onClick={() => onPlace(panelId, 'left')}
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${placement === 'left' ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`${panelLabels[panelId]}停靠到右侧`}
        title="停靠到右侧"
        onClick={() => onPlace(panelId, 'right')}
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${placement === 'right' ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
      >
        <PanelRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`${panelLabels[panelId]}改为弹窗呼出`}
        title="改为弹窗呼出"
        onClick={() => onPlace(panelId, 'popup')}
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${placement === 'popup' ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
      >
        <Move className="h-4 w-4" />
      </button>
    </div>
  )
}

function DockedPanel({
  panelId,
  side,
  placement,
  onPlace,
  onDragStart,
  onDragEnd,
  children,
}: {
  panelId: WorkspacePanelId
  side: WorkspaceDockSide
  placement: WorkspacePanelPlacement
  onPlace: (panelId: WorkspacePanelId, placement: WorkspacePanelPlacement) => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, panelId: WorkspacePanelId) => void
  onDragEnd: () => void
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-2">
        <button
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, panelId)}
          onDragEnd={onDragEnd}
          className="flex h-8 cursor-grab items-center gap-1 rounded-lg px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
          title="拖动到另一侧"
        >
          <GripVertical className="h-4 w-4" />
          <span className="text-xs font-semibold text-slate-600">{panelLabels[panelId]}</span>
        </button>
        <div className="ml-auto">
          <PanelPlacementControls panelId={panelId} placement={placement} onPlace={onPlace} />
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-center text-[10px] text-slate-400">
        已停靠在{side === 'left' ? '左侧' : '右侧'} · 拖动题头可换边
      </div>
    </div>
  )
}

export function DockZone({
  side,
  width,
  panels,
  activePanel,
  onActivePanelChange,
  onPlace,
  onDragStart,
  onDragEnd,
  onDropPanel,
  renderPanel,
}: {
  side: WorkspaceDockSide
  width: number
  panels: WorkspacePanelId[]
  activePanel: WorkspacePanelId
  onActivePanelChange: (panel: WorkspacePanelId) => void
  onPlace: (panelId: WorkspacePanelId, placement: WorkspacePanelPlacement) => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, panelId: WorkspacePanelId) => void
  onDragEnd: () => void
  onDropPanel: (side: WorkspaceDockSide) => void
  renderPanel: (panel: WorkspacePanelId) => ReactNode
}) {
  const visiblePanel = panels.includes(activePanel) ? activePanel : panels[0]

  return (
    <aside
      aria-label={`${side === 'left' ? '左侧' : '右侧'}停靠区`}
      className={`hidden h-[100dvh] shrink-0 overflow-hidden bg-white xl:flex xl:flex-col ${side === 'left' ? 'border-r' : 'border-l'} border-slate-200`}
      style={{ width }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDropPanel(side)
      }}
    >
      {panels.length > 1 && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
          {panels.map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => onActivePanelChange(panel)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${visiblePanel === panel ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {panelLabels[panel]}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {visiblePanel && (
          <DockedPanel
            panelId={visiblePanel}
            side={side}
            placement={side}
            onPlace={onPlace}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            {renderPanel(visiblePanel)}
          </DockedPanel>
        )}
      </div>
    </aside>
  )
}
