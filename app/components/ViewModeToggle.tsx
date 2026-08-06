'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Columns3, GalleryHorizontal, LayoutGrid, List, type LucideIcon } from 'lucide-react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

export type ViewMode = 'card' | 'list'
export type DisplayMode = ViewMode | 'columns' | 'gallery'

const displayModeDefinitions: Record<DisplayMode, { label: string; icon: LucideIcon }> = {
  card: { label: '图标', icon: LayoutGrid },
  list: { label: '列表', icon: List },
  columns: { label: '分栏', icon: Columns3 },
  gallery: { label: '画廊', icon: GalleryHorizontal },
}

interface ViewModeToggleProps<T extends DisplayMode = ViewMode> {
  value: T
  onChange: (value: T) => void
  modes?: readonly T[]
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

export function DisplayModeToggle<T extends DisplayMode>({
  value,
  onChange,
  modes,
}: {
  value: T
  onChange: (value: T) => void
  modes: readonly T[]
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
          className="absolute right-0 top-[calc(100%+6px)] z-[140] w-40 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
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
        </div>
      )}
    </div>
  )
}

export default function ViewModeToggle<T extends DisplayMode = ViewMode>({
  value,
  onChange,
  modes,
}: ViewModeToggleProps<T>) {
  return <DisplayModeToggle value={value} onChange={onChange} modes={modes || (['card', 'list'] as unknown as readonly T[])} />
}
