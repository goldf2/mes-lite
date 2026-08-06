'use client'

import { Check, ChevronDown, GripHorizontal, LayoutPanelTop, List, Minimize2, PanelTop, Rows3 } from 'lucide-react'
import {
  CSSProperties,
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import AppButton from '../AppButton'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import useCompactViewport from '../useCompactViewport'
import MovableEdgeTrigger from './MovableEdgeTrigger'
import SplitWorkspace from './SplitWorkspace'

export type CompactMasterDetailMode = 'overlay' | 'stacked' | 'switch'

interface AdaptiveMasterDetailContextValue {
  hideCompactBack?: boolean
}

const AdaptiveMasterDetailContext = createContext<AdaptiveMasterDetailContextValue | null>(null)

export function useAdaptiveMasterDetailContext() {
  return useContext(AdaptiveMasterDetailContext)
}

const compactModeOptions: Array<{
  value: CompactMasterDetailMode
  label: string
  icon: typeof List
}> = [
  { value: 'overlay', label: '弹窗', icon: List },
  { value: 'stacked', label: '上下', icon: Rows3 },
  { value: 'switch', label: '切换', icon: PanelTop },
]

export function CompactMasterDetailModeSelector({
  value,
  onChange,
}: {
  value: CompactMasterDetailMode
  onChange: (value: CompactMasterDetailMode) => void
}) {
  return (
    <div role="radiogroup" aria-label="主从页面显示模式" className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
      {compactModeOptions.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-700'}`}
          >
            <Icon aria-hidden="true" size={15} />
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

type OverlayState = 'open' | 'minimized'

function StackedWorkspace({
  children,
  storageKey,
  primaryLabel,
  secondaryLabel,
}: {
  children: [ReactNode, ReactNode]
  storageKey: string
  primaryLabel: string
  secondaryLabel: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [primaryPercent, setPrimaryPercent] = useState(42)
  const [storageReady, setStorageReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const minPrimaryPercent = 28
  const maxPrimaryPercent = 65

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey))
    if (Number.isFinite(saved) && saved >= minPrimaryPercent && saved <= maxPrimaryPercent) {
      setPrimaryPercent(saved)
    }
    setStorageReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageReady) return
    window.localStorage.setItem(storageKey, String(primaryPercent))
  }, [primaryPercent, storageKey, storageReady])

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.height <= 0) return
      const next = ((event.clientY - rect.top) / rect.height) * 100
      setPrimaryPercent(Math.min(maxPrimaryPercent, Math.max(minPrimaryPercent, next)))
    }
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [dragging])

  const adjustByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -3 : 3
    setPrimaryPercent((current) => Math.min(maxPrimaryPercent, Math.max(minPrimaryPercent, current + delta)))
  }

  return (
    <div
      ref={containerRef}
      style={{
        '--stack-primary': `${primaryPercent}fr`,
        '--stack-secondary': `${100 - primaryPercent}fr`,
      } as CSSProperties}
      aria-busy={!storageReady}
      className={`grid h-[clamp(34rem,calc(100dvh-16rem),54rem)] min-h-0 grid-rows-[minmax(0,var(--stack-primary))_12px_minmax(0,var(--stack-secondary))] ${storageReady ? 'visible' : 'invisible pointer-events-none'}`}
    >
      <div aria-label={primaryLabel} className="min-h-0 pb-1.5">{children[0]}</div>
      <div
        role="separator"
        aria-label={`调整${primaryLabel}与${secondaryLabel}高度`}
        aria-orientation="horizontal"
        aria-valuemin={minPrimaryPercent}
        aria-valuemax={maxPrimaryPercent}
        aria-valuenow={Math.round(primaryPercent)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onKeyDown={adjustByKeyboard}
        className={`group relative flex cursor-row-resize items-center justify-stretch outline-none ${dragging ? 'bg-blue-50' : ''}`}
      >
        <div className={`h-px w-full transition group-hover:bg-blue-400 group-focus:bg-blue-500 ${dragging ? 'bg-blue-500' : 'bg-gray-200'}`} />
        <span className={`absolute left-1/2 flex h-3 w-9 -translate-x-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition group-hover:border-blue-300 group-hover:text-blue-600 group-focus:border-blue-400 ${dragging ? 'border-blue-400 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
          <GripHorizontal aria-hidden="true" size={14} />
        </span>
      </div>
      <div aria-label={secondaryLabel} className="min-h-0 pt-1.5">{children[1]}</div>
    </div>
  )
}

export default function AdaptiveMasterDetailWorkspace({
  storageKey,
  primaryLabel,
  secondaryLabel,
  primaryCount,
  selectionKey,
  primary,
  secondary,
  defaultCompactMode = 'overlay',
  compactMode,
  onCompactModeChange,
  desktopPrimaryPercent = 58,
  desktopMinPrimaryPercent = 38,
  desktopMaxPrimaryPercent = 68,
}: {
  storageKey: string
  primaryLabel: string
  secondaryLabel: string
  primaryCount: number
  selectionKey?: string | null
  primary: ReactNode
  secondary: ReactNode
  defaultCompactMode?: CompactMasterDetailMode
  compactMode?: CompactMasterDetailMode
  onCompactModeChange?: (value: CompactMasterDetailMode) => void
  desktopPrimaryPercent?: number
  desktopMinPrimaryPercent?: number
  desktopMaxPrimaryPercent?: number
}) {
  const compact = useCompactViewport(1279)
  const [viewportReady, setViewportReady] = useState(false)
  const [internalMode, setInternalMode] = useState<CompactMasterDetailMode>(defaultCompactMode)
  const mode = compactMode ?? internalMode
  const [layoutReady, setLayoutReady] = useState(false)
  const [overlayState, setOverlayState] = useState<OverlayState>('minimized')
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const layoutMenuRef = useDismissibleSearchPopup<HTMLDivElement>(layoutMenuOpen, () => setLayoutMenuOpen(false))
  const previousSelectionRef = useRef(selectionKey)
  const modeStorageKey = `${storageKey}.compact-mode.v1`

  useEffect(() => setViewportReady(true), [])

  useEffect(() => {
    const savedMode = window.localStorage.getItem(modeStorageKey)
    if (savedMode === 'overlay' || savedMode === 'stacked' || savedMode === 'switch') {
      setInternalMode(savedMode)
      onCompactModeChange?.(savedMode)
    }
    setLayoutReady(true)
  }, [modeStorageKey, onCompactModeChange])

  useEffect(() => {
    if (!layoutReady) return
    window.localStorage.setItem(modeStorageKey, mode)
  }, [layoutReady, mode, modeStorageKey])

  useEffect(() => {
    const selectionChanged = previousSelectionRef.current !== selectionKey
    previousSelectionRef.current = selectionKey
    if (selectionChanged && selectionKey && compact && mode === 'overlay' && overlayState === 'open') {
      setOverlayState('minimized')
    }
  }, [compact, mode, overlayState, selectionKey])

  useEffect(() => {
    const handleSideDockOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail === 'tools') setOverlayState('minimized')
    }
    window.addEventListener('mes:side-dock-open', handleSideDockOpen)
    return () => window.removeEventListener('mes:side-dock-open', handleSideDockOpen)
  }, [])

  const changeMode = (next: CompactMasterDetailMode) => {
    if (compactMode === undefined) setInternalMode(next)
    onCompactModeChange?.(next)
    setLayoutMenuOpen(false)
    if (next === 'overlay') {
      setOverlayState('minimized')
    }
  }

  const openOverlay = () => {
    window.dispatchEvent(new CustomEvent('mes:side-dock-open', { detail: 'navigator' }))
    setOverlayState('open')
  }

  const secondaryContext: AdaptiveMasterDetailContextValue = mode === 'overlay'
    ? { hideCompactBack: true }
    : mode === 'stacked'
      ? { hideCompactBack: true }
      : {}

  if (!viewportReady) {
    return <div aria-busy="true" className="h-[30rem]" />
  }

  if (!compact) {
    return (
      <SplitWorkspace
        storageKey={`${storageKey}.left-right.v1`}
        primaryLabel={primaryLabel}
        secondaryLabel={secondaryLabel}
        defaultPrimaryPercent={desktopPrimaryPercent}
        minPrimaryPercent={desktopMinPrimaryPercent}
        maxPrimaryPercent={desktopMaxPrimaryPercent}
        className="xl:h-[clamp(30rem,calc(100dvh-12rem),60rem)]"
      >
        {primary}
        {secondary}
      </SplitWorkspace>
    )
  }

  return (
    <div className={`min-w-0 space-y-2 ${layoutReady ? 'visible' : 'invisible pointer-events-none'}`} aria-busy={!layoutReady}>
      <section aria-label="窄屏显示模式" className="hidden min-h-9 items-center justify-end sm:flex">
        <div ref={layoutMenuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={layoutMenuOpen}
            onClick={() => setLayoutMenuOpen((open) => !open)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <LayoutPanelTop aria-hidden="true" size={15} />
            布局 · {compactModeOptions.find((option) => option.value === mode)?.label}
            <ChevronDown aria-hidden="true" size={14} className={`transition-transform ${layoutMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {layoutMenuOpen && (
            <div role="menu" aria-label="选择主从页面显示模式" className="absolute right-0 top-[calc(100%+6px)] z-[130] w-40 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              {compactModeOptions.map((option) => {
                const Icon = option.icon
                const active = mode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => changeMode(option.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Icon aria-hidden="true" size={15} />
                    <span className="flex-1">{option.label}</span>
                    {active && <Check aria-hidden="true" size={15} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {mode === 'stacked' ? (
        <StackedWorkspace
          storageKey={`${storageKey}.top-bottom.v1`}
          primaryLabel={primaryLabel}
          secondaryLabel={secondaryLabel}
        >
          {[
            primary,
            <AdaptiveMasterDetailContext.Provider key="secondary" value={secondaryContext}>
              {secondary}
            </AdaptiveMasterDetailContext.Provider>,
          ]}
        </StackedWorkspace>
      ) : (
        <AdaptiveMasterDetailContext.Provider value={secondaryContext}>
          {secondary}
        </AdaptiveMasterDetailContext.Provider>
      )}

      {mode === 'overlay' && (
        <>
          <div
            role="dialog"
            aria-label={`${primaryLabel}弹窗`}
            className={`fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[115] flex h-[min(72dvh,40rem)] min-h-[22rem] w-[min(86vw,22rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl ${overlayState === 'open' ? 'visible mes-navigator-overlay-open' : 'invisible pointer-events-none'}`}
          >
            <div
              className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/90 px-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <List aria-hidden="true" size={16} className="shrink-0 text-blue-600" />
                <span className="truncate text-sm font-semibold text-gray-900">{primaryLabel}</span>
                <span className="shrink-0 text-xs text-gray-500">{primaryCount} 条</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AppButton variant="ghost" size="icon" className="!h-8 !w-8" onClick={() => setOverlayState('minimized')} aria-label={`最小化${primaryLabel}`} title="最小化">
                  <Minimize2 aria-hidden="true" size={16} />
                </AppButton>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden [&>section]:!rounded-none [&>section]:!border-0 [&>section]:!shadow-none">
              {primary}
            </div>
          </div>

          {overlayState === 'minimized' && (
            <MovableEdgeTrigger
              edge="left"
              storageKey="mes-lite.edge-trigger.left.v1"
              label={`呼出${primaryLabel}`}
              onActivate={openOverlay}
              badge={primaryCount}
              className="mes-dock-trigger-left !z-[115]"
            >
              <List aria-hidden="true" size={19} />
            </MovableEdgeTrigger>
          )}
        </>
      )}
    </div>
  )
}
