'use client'

import { useCallback, useEffect, useState } from 'react'
import { Columns3, GalleryHorizontal, LayoutGrid, List, type LucideIcon } from 'lucide-react'

export type ViewMode = 'card' | 'list'
export type DisplayMode = ViewMode | 'columns' | 'gallery'

const displayModeDefinitions: Record<DisplayMode, { label: string; icon: LucideIcon }> = {
  card: { label: '图标', icon: LayoutGrid },
  list: { label: '列表', icon: List },
  columns: { label: '分栏', icon: Columns3 },
  gallery: { label: '画廊', icon: GalleryHorizontal },
}

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (value: ViewMode) => void
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

export function DisplayModeToggle<T extends DisplayMode>({
  value,
  onChange,
  modes,
}: {
  value: T
  onChange: (value: T) => void
  modes: readonly T[]
}) {
  return (
    <div role="group" aria-label="显示模式" className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      {modes.map((mode) => {
        const definition = displayModeDefinitions[mode]
        const ModeIcon = definition.icon
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            title={`显示为${definition.label}`}
            aria-label={`显示为${definition.label}`}
            aria-pressed={value === mode}
            className={`inline-flex h-8 w-9 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              value === mode
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <ModeIcon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        )
      })}
    </div>
  )
}

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return <DisplayModeToggle value={value} onChange={onChange} modes={['card', 'list']} />
}
