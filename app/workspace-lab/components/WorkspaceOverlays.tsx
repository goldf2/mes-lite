import { Check, GripVertical, X } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  detectWorkspacePreset,
  workspacePresets,
  type WorkspacePanelId,
  type WorkspacePreference,
} from '../workspaceLab'
import { PanelPlacementControls } from './WorkspaceChrome'
import { panelLabels, ToolContent } from './WorkspacePanels'

export function LayoutMenu({
  preference,
  onPreferenceChange,
  onApplyPreset,
  onClose,
}: {
  preference: WorkspacePreference
  onPreferenceChange: (preference: WorkspacePreference) => void
  onApplyPreset: (presetIndex: number) => void
  onClose: () => void
}) {
  const presetKey = detectWorkspacePreset(preference)

  const toggle = (key: 'topNavigation' | 'topToolbar') => {
    onPreferenceChange({ ...preference, [key]: !preference[key] })
  }

  return (
    <div className="fixed inset-0 z-[90]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="工作区布局"
        className="absolute right-4 top-16 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="font-bold text-slate-950">工作区布局</div>
            <div className="mt-1 text-xs text-slate-400">预设或自由组合导航与工具区域</div>
          </div>
          <button type="button" aria-label="关闭工作区布局" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-4">
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">布局预设</div>
          <div className="grid grid-cols-2 gap-2">
            {workspacePresets.map((preset, index) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => onApplyPreset(index)}
                className={`rounded-xl border p-3 text-left transition ${presetKey === preset.key ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{preset.label}</span>
                  {presetKey === preset.key && <Check className="h-4 w-4 text-blue-600" />}
                </div>
                <div className="mt-1 text-[11px] leading-4 text-slate-400">{preset.description}</div>
              </button>
            ))}
          </div>

          <div className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">顶部区域</div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {([
              ['topNavigation', '顶部导航', '显示一级功能入口'],
              ['topToolbar', '顶部工具', '显示搜索和页面操作'],
            ] as const).map(([key, label, description]) => (
              <button key={key} type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50">
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${preference[key] ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${preference[key] ? 'left-6' : 'left-1'}`} />
                </span>
                <span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-xs text-slate-400">{description}</span></span>
              </button>
            ))}
          </div>

          <div className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">可停靠面板</div>
          <div className="space-y-2">
            {(['navigation', 'tools'] as WorkspacePanelId[]).map((panelId) => (
              <div key={panelId} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                <div><div className="text-sm font-semibold text-slate-800">{panelLabels[panelId]}</div><div className="mt-0.5 text-xs text-slate-400">左侧、右侧或弹窗</div></div>
                <PanelPlacementControls
                  panelId={panelId}
                  placement={preference.placements[panelId]}
                  onPlace={(id, placement) => onPreferenceChange({ ...preference, placements: { ...preference.placements, [id]: placement } })}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            提示：也可以直接拖动左右面板题头。主显示区域不会重新加载。
          </div>
        </div>
      </div>
    </div>
  )
}

export function FloatingToolWindow({
  onClose,
  activeTool,
  onActiveToolChange,
}: {
  onClose: () => void
  activeTool: string
  onActiveToolChange: (tool: string) => void
}) {
  const [position, setPosition] = useState({ x: 24, y: 96 })
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setPosition({ x: Math.max(16, window.innerWidth - 404), y: 96 })
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - 376, drag.x + event.clientX - drag.pointerX)),
        y: Math.max(8, Math.min(window.innerHeight - 120, drag.y + event.clientY - drag.pointerY)),
      })
    }
    const stop = () => { dragRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [])

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y }
  }

  return (
    <div
      className="fixed z-[80] flex h-[min(620px,calc(100dvh-7rem))] w-[368px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      style={{ left: position.x, top: position.y }}
    >
      <div onPointerDown={beginMove} className="flex h-12 cursor-move items-center gap-2 border-b border-slate-200 px-3 select-none">
        <GripVertical className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-bold text-slate-800">浮动工具</span>
        <span className="text-[10px] text-slate-400">可移动 · 连续操作</span>
        <button type="button" aria-label="关闭工具弹窗" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1"><ToolContent activeTool={activeTool} onActiveToolChange={onActiveToolChange} /></div>
    </div>
  )
}
