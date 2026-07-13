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
    <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-gray-100 p-1">
      {([
        ['card', '卡片'],
        ['list', '列表'],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-1.5 text-sm font-medium transition ${
            value === mode
              ? 'rounded-md bg-white text-blue-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
