'use client'

import { Bookmark, BookmarkPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

const searchPresetEventName = 'mes-lite:search-presets-updated'
const maxPresetCount = 20

function readPresets(storageKey: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, maxPresetCount)
  } catch {
    return []
  }
}

export default function SavedSearchPresets({
  storageKey,
  value,
  onApply,
}: {
  storageKey: string
  value: string
  onApply: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<string[]>([])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, () => setOpen(false))
  const currentValue = value.trim()
  const currentSaved = useMemo(
    () => presets.some((preset) => preset.toLocaleLowerCase('zh-CN') === currentValue.toLocaleLowerCase('zh-CN')),
    [currentValue, presets]
  )

  const refreshPresets = useCallback(() => {
    setPresets(readPresets(storageKey))
  }, [storageKey])

  useEffect(() => {
    refreshPresets()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) refreshPresets()
    }
    const handlePresetUpdate = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) refreshPresets()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(searchPresetEventName, handlePresetUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(searchPresetEventName, handlePresetUpdate)
    }
  }, [refreshPresets, storageKey])

  const persistPresets = (next: string[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
      setPresets(next)
      window.dispatchEvent(new CustomEvent(searchPresetEventName, { detail: storageKey }))
    } catch {
      // 浏览器禁用本地存储时，保留当前页面功能，不影响原有搜索。
    }
  }

  const saveCurrent = () => {
    if (!currentValue || currentSaved) return
    persistPresets([currentValue, ...presets].slice(0, maxPresetCount))
  }

  const removePreset = (preset: string) => {
    persistPresets(presets.filter((item) => item !== preset))
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${open ? 'z-[100]' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="快捷搜索"
        className="inline-flex h-9 w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-0 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:h-10 sm:w-auto sm:px-3 sm:text-sm"
      >
        <Bookmark aria-hidden="true" className="h-4 w-4 text-blue-600" />
        <span className="hidden sm:inline">快捷搜索</span>
        {presets.length > 0 && (
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none text-blue-700">
            {presets.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="快捷搜索"
          className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[min(320px,calc(100vw-24px))] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">快捷搜索</div>
              <div className="mt-0.5 text-xs text-gray-500">仅保存在当前浏览器</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭快捷搜索"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {currentValue && !currentSaved && (
            <button
              type="button"
              onClick={saveCurrent}
              className="mb-2 flex w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-100"
            >
              <BookmarkPlus aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">保存“{currentValue}”</span>
            </button>
          )}

          {presets.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {presets.map((preset) => (
                <div key={preset} className="group flex items-center rounded-md hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(preset)
                      setOpen(false)
                    }}
                    title={preset}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-gray-700"
                  >
                    {preset}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePreset(preset)}
                    aria-label={`删除快捷搜索 ${preset}`}
                    className="mr-1 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
              先输入搜索词，再保存为快捷搜索
            </div>
          )}

          {value && (
            <button
              type="button"
              onClick={() => {
                onApply('')
                setOpen(false)
              }}
              className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
            >
              清除当前搜索
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function SearchFieldWithPresets({
  storageKey,
  value,
  onChange,
  placeholder,
  inputClassName = 'h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm sm:h-10 sm:px-4 sm:py-2',
  className = 'flex w-full min-w-[260px] max-w-[450px] flex-[1_1_360px] items-center gap-2',
}: {
  storageKey: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputClassName?: string
  className?: string
}) {
  return (
    <div className={className}>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      <SavedSearchPresets storageKey={storageKey} value={value} onApply={onChange} />
    </div>
  )
}
