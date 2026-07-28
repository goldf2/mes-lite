'use client'

import { useCallback, useMemo, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

export interface MaterialChoiceOption {
  id: string
  sku: string
  name: string
  category?: string
  unit?: string
  customer?: { id: string; code?: string; name: string } | null
}

export default function MaterialChoiceSearch({
  value,
  options,
  onChange,
  placeholder = '输入物料编码或名称筛选',
}: {
  value: string
  options: MaterialChoiceOption[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = options.find((option) => option.id === value)
  const keyword = query.trim().toLowerCase()
  const filtered = useMemo(() => options.filter((option) => {
    if (!keyword) return true
    return `${option.sku} ${option.name} ${option.category || ''} ${option.customer?.name || ''}`.toLowerCase().includes(keyword)
  }).slice(0, 50), [keyword, options])

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? `${selected.sku} · ${selected.name}` : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id)
                  closePopup()
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === option.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-gray-500">{option.sku}</span>
                    <span className="ml-2">{option.name}</span>
                    {option.customer && <span className="ml-2 text-xs text-gray-500">{option.customer.name}</span>}
                  </span>
                  {option.unit && <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{option.unit}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
