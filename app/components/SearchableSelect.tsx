'use client'

import { ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import useSearchPopupPlacement from './useSearchPopupPlacement'
import { appInputClassName } from './FormField'

export interface SearchableSelectOption {
  value: string
  label: string
  keywords?: string
  disabled?: boolean
  [key: string]: unknown
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '输入关键词筛选',
  emptyText = '没有匹配选项',
  disabled = false,
  allowClear = false,
  className = '',
  renderOption,
  onSearch,
  searchHint = '可输入关键词筛选',
}: {
  value: string
  options: SearchableSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  allowClear?: boolean
  className?: string
  renderOption?: (option: SearchableSelectOption) => ReactNode
  onSearch?: (keyword: string) => void | Promise<void>
  searchHint?: string
}) {
  const listboxId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { openUpward, popupMaxHeight, updatePopupPlacement } = useSearchPopupPlacement()
  const selected = options.find((option) => option.value === value)
  const keyword = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => options.filter((option) => {
    if (!keyword) return true
    return `${option.label} ${option.keywords || ''}`.toLocaleLowerCase().includes(keyword)
  }).slice(0, 100), [keyword, options])

  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(filtered.length - 1)
  }, [activeIndex, filtered.length])

  useEffect(() => {
    if (!open || !onSearch) return
    const timer = window.setTimeout(() => {
      void onSearch(query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [onSearch, open, query])

  const choose = (nextValue: string) => {
    onChange(nextValue)
    closePopup()
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        onFocus={(event) => {
          updatePopupPlacement(event.currentTarget)
          setOpen(true)
          setQuery('')
          setActiveIndex(-1)
        }}
        onChange={(event) => {
          updatePopupPlacement(event.currentTarget)
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            return closePopup()
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            updatePopupPlacement(event.currentTarget)
            setOpen(true)
            setActiveIndex((current) => Math.min(current + 1, filtered.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) => Math.max(current - 1, 0))
          }
          if (event.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex] && !filtered[activeIndex].disabled) {
            event.preventDefault()
            choose(filtered[activeIndex].value)
          }
        }}
        className={`${appInputClassName} pr-10`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">⌄</span>
      {allowClear && value && !disabled && (
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose('')} className="absolute right-7 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-gray-400 hover:text-gray-700" aria-label="清除选择">×</button>
      )}
      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          style={{ maxHeight: popupMaxHeight }}
          className={`absolute left-0 right-0 z-[90] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white p-1 shadow-lg ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">{emptyText}</div>
          ) : filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(option.value)
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={(event) => {
                // Mouse selection is committed on mouse down so the popup cannot
                // close on focus transfer first. Keyboard and assistive clicks
                // have detail 0 and are committed here instead.
                if (event.detail === 0) choose(option.value)
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm disabled:text-gray-300 ${index === activeIndex || option.value === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              {renderOption ? renderOption(option) : option.label}
            </button>
          ))}
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">{searchHint}</div>
        </div>
      )}
    </div>
  )
}
