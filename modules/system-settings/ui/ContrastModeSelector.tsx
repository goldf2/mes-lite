'use client'

import { Check } from 'lucide-react'
import { contrastModes, ContrastMode } from '@/lib/contrast-modes'

export default function ContrastModeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ContrastMode
  onChange: (value: ContrastMode) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="页面对比度配色" className="grid gap-3 md:grid-cols-3">
      {contrastModes.map((mode) => {
        const active = value === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
            className={`relative rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'}`}
          >
            <span
              aria-hidden="true"
              className="block rounded-lg border p-2"
              style={{ backgroundColor: mode.preview.canvas, borderColor: mode.preview.border }}
            >
              <span className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ backgroundColor: mode.preview.surface, borderColor: mode.preview.border }}>
                <span className="h-5 w-1 rounded-full bg-blue-500" />
                <span className="min-w-0 flex-1">
                  <span className="block h-1.5 w-3/4 rounded-full" style={{ backgroundColor: mode.preview.text }} />
                  <span className="mt-1.5 block h-1 w-1/2 rounded-full" style={{ backgroundColor: mode.preview.muted }} />
                </span>
              </span>
            </span>
            <span className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-900">{mode.label}</span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${active ? 'bg-blue-600 text-white' : 'border border-gray-300 text-transparent'}`}>
                <Check aria-hidden="true" size={13} />
              </span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-gray-500">{mode.description}</span>
          </button>
        )
      })}
    </div>
  )
}
