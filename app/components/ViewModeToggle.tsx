'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Columns3, GalleryHorizontal, LayoutGrid, List, Minus, PanelsTopLeft, Plus, type LucideIcon } from 'lucide-react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

export type ViewMode = 'card' | 'list'
export type DisplayMode = ViewMode | 'icon' | 'columns' | 'gallery'

const displayModeDefinitions: Record<DisplayMode, { label: string; icon: LucideIcon }> = {
  icon: { label: '图标', icon: LayoutGrid },
  list: { label: '列表', icon: List },
  card: { label: '卡片', icon: PanelsTopLeft },
  columns: { label: '分栏', icon: Columns3 },
  gallery: { label: '画廊', icon: GalleryHorizontal },
}

interface ViewModeToggleProps<T extends DisplayMode = ViewMode> {
  value: T
  onChange: (value: T) => void
  modes?: readonly T[]
  iconSize?: number
  onIconSizeChange?: (value: number) => void
}

export function usePersistedViewMode(storageKey: string, defaultValue: ViewMode = 'list') {
  const [value, setValue] = useState<ViewMode>(defaultValue)

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === 'card' || saved === 'list') {
      setValue(saved)
    }
  }, [storageKey])

  const update = useCallback((nextValue: ViewMode) => {
    setValue(nextValue)
    window.localStorage.setItem(storageKey, nextValue)
  }, [storageKey])

  return [value, update] as const
}

export function usePersistedDisplayMode<T extends DisplayMode>(
  storageKey: string,
  defaultValue: T,
  modes: readonly T[],
) {
  const [value, setValue] = useState<T>(defaultValue)

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) as T | null
    if (saved && modes.includes(saved)) setValue(saved)
  }, [modes, storageKey])

  const update = useCallback((nextValue: T) => {
    setValue(nextValue)
    window.localStorage.setItem(storageKey, nextValue)
  }, [storageKey])

  return [value, update] as const
}

export function usePersistedIconSize(storageKey: string, defaultValue = 104) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey))
    if (Number.isFinite(saved) && saved >= 72 && saved <= 160) setValue(saved)
  }, [storageKey])

  const update = useCallback((nextValue: number) => {
    const normalized = Math.min(160, Math.max(72, Math.round(nextValue / 8) * 8))
    setValue(normalized)
    window.localStorage.setItem(storageKey, String(normalized))
  }, [storageKey])

  return [value, update] as const
}

export function DisplayModeToggle<T extends DisplayMode>({
  value,
  onChange,
  modes,
  iconSize,
  onIconSizeChange,
}: {
  value: T
  onChange: (value: T) => void
  modes: readonly T[]
  iconSize?: number
  onIconSizeChange?: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const popupRef = useDismissibleSearchPopup<HTMLDivElement>(open, () => setOpen(false))
  const activeDefinition = displayModeDefinitions[value]
  const ActiveIcon = activeDefinition.icon

  return (
    <div ref={popupRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`显示方式：${activeDefinition.label}`}
        title={`显示方式：${activeDefinition.label}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-gray-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        <ActiveIcon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="选择显示模式"
          className="absolute right-0 top-[calc(100%+6px)] z-[140] w-44 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
        >
          {modes.map((mode) => {
            const definition = displayModeDefinitions[mode]
            const ModeIcon = definition.icon
            const active = value === mode
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(mode)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <ModeIcon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="flex-1">{definition.label}</span>
                {active && <Check aria-hidden="true" className="h-4 w-4" />}
              </button>
            )
          })}
          {value === 'icon' && iconSize !== undefined && onIconSizeChange && (
            <div className="mt-1 border-t border-gray-100 px-2.5 pb-1.5 pt-2.5">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>图标大小</span>
                <span>{iconSize}px</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <button
                  type="button"
                  aria-label="缩小图标"
                  disabled={iconSize <= 72}
                  onClick={() => onIconSizeChange(iconSize - 8)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={72}
                  max={160}
                  step={8}
                  value={iconSize}
                  onChange={(event) => onIconSizeChange(Number(event.target.value))}
                  aria-label="图标大小"
                  className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-600"
                />
                <button
                  type="button"
                  aria-label="放大图标"
                  disabled={iconSize >= 160}
                  onClick={() => onIconSizeChange(iconSize + 8)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ViewModeToggle<T extends DisplayMode = ViewMode>({
  value,
  onChange,
  modes,
  iconSize,
  onIconSizeChange,
}: ViewModeToggleProps<T>) {
  return (
    <DisplayModeToggle
      value={value}
      onChange={onChange}
      modes={modes || (['card', 'list'] as unknown as readonly T[])}
      iconSize={iconSize}
      onIconSizeChange={onIconSizeChange}
    />
  )
}
