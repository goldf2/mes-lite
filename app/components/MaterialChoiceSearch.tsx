'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import { appInputClassName } from './FormField'

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
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = options.find((option) => option.id === value)
  const keyword = query.trim().toLowerCase()
  const filtered = useMemo(() => options.filter((option) => {
    if (!keyword) return true
    return `${option.sku} ${option.name} ${option.category || ''} ${option.customer?.name || ''}`.toLowerCase().includes(keyword)
  }).slice(0, 50), [keyword, options])

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(filtered.length - 1)
  }, [activeIndex, filtered.length])

  const choose = (nextValue: string) => {
    onChange(nextValue)
    closePopup()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        value={open ? query : (selected ? `${selected.sku} · ${selected.name}` : query)}
        onFocus={() => {
          setOpen(true)
          setActiveIndex(-1)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            return closePopup()
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => Math.min(current + 1, filtered.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) => Math.max(current - 1, 0))
          }
          if (event.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
            event.preventDefault()
            choose(filtered[activeIndex].id)
          }
        }}
        placeholder={placeholder}
        className={appInputClassName}
      />
      {open && (
        <div id={listboxId} role="listbox" className="absolute left-0 right-0 z-[90] mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={value === option.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.id)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === option.id || activeIndex === index ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
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
