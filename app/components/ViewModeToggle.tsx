'use client'

import { useCallback, useEffect, useState } from 'react'

export type ViewMode = 'card' | 'list'

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

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm sm:p-1">
      {([
        ['card', '▦', '卡片'],
        ['list', '☰', '列表'],
      ] as const).map(([mode, icon, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          title={label}
          aria-label={label}
          className={`inline-flex min-w-9 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm ${
            value === mode
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="text-sm leading-none">{icon}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
