'use client'

import { useCallback, useEffect, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

export type VisibleFieldOption<T extends string> = { key: T; label: string }

export function usePersistedVisibleFields<T extends string>(storageKey: string, defaults: T[], options: readonly VisibleFieldOption<T>[]) {
  const [value, setValue] = useState<T[]>(defaults)
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return
    try {
      const allowed = new Set(options.map((option) => option.key))
      const parsed = JSON.parse(saved) as string[]
      const next = parsed.filter((item): item is T => allowed.has(item as T))
      if (next.length > 0) setValue(next)
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [options, storageKey])
  const update = useCallback((next: T[]) => {
    if (next.length === 0) return
    setValue(next)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  }, [storageKey])
  return [value, update] as const
}

export default function VisibleFieldControl<T extends string>({ options, value, onChange }: {
  options: readonly VisibleFieldOption<T>[]
  value: T[]
  onChange: (next: T[]) => void
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, close)
  const selected = new Set(value)
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((current) => !current)} className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">显示项</button>
      {open && <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
        {options.map((option) => <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <input type="checkbox" checked={selected.has(option.key)} onChange={() => onChange(selected.has(option.key) ? value.filter((item) => item !== option.key) : [...value, option.key])} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          {option.label}
        </label>)}
      </div>}
    </div>
  )
}
