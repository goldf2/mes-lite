'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'

export type StatusFilterOption = {
  value: string
  label: string
}

export function getStatusQuery(selected: string[], options: StatusFilterOption[]) {
  return getMultiSelectQuery('statuses', selected, options)
}

export function getMultiSelectQuery(paramName: string, selected: string[], options: StatusFilterOption[]) {
  if (selected.length === options.length) return ''
  const params = new URLSearchParams()
  params.set(paramName, selected.length > 0 ? selected.join(',') : '__NONE__')
  return params.toString()
}

export default function StatusCheckboxFilter({
  options,
  value,
  onChange,
  allLabel = '全部状态',
  storageKey,
}: {
  options: StatusFilterOption[]
  value: string[]
  onChange: (next: string[]) => void
  allLabel?: string
  storageKey?: string
}) {
  const optionValuesKey = options.map((option) => option.value).join('\u001f')
  const [orderedValues, setOrderedValues] = useState<string[]>(() => options.map((option) => option.value))
  const [draggedValue, setDraggedValue] = useState<string | null>(null)
  const optionByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])
  const orderedOptions = useMemo(() => (
    orderedValues
      .map((optionValue) => optionByValue.get(optionValue))
      .filter(Boolean) as StatusFilterOption[]
  ), [orderedValues, optionByValue])
  const allSelected = value.length === options.length

  useEffect(() => {
    const defaultValues = options.map((option) => option.value)
    if (!storageKey) {
      setOrderedValues(defaultValues)
      return
    }

    try {
      const saved = window.localStorage.getItem(storageKey)
      const savedValues = saved ? JSON.parse(saved) : []
      const validSavedValues = Array.isArray(savedValues)
        ? savedValues.filter((item): item is string => typeof item === 'string' && defaultValues.includes(item))
        : []
      const nextValues = [
        ...validSavedValues,
        ...defaultValues.filter((item) => !validSavedValues.includes(item)),
      ]
      setOrderedValues(nextValues)
    } catch (error) {
      setOrderedValues(defaultValues)
    }
  }, [storageKey, optionValuesKey, options])

  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((option) => option.value))
  }

  const toggleOption = (status: string) => {
    if (value.includes(status)) {
      onChange(value.filter((item) => item !== status))
      return
    }
    onChange([...value, status])
  }

  const saveOrder = (nextValues: string[]) => {
    setOrderedValues(nextValues)
    if (storageKey) {
      window.localStorage.setItem(storageKey, JSON.stringify(nextValues))
    }
  }

  const moveOptionByStep = (optionValue: string, direction: -1 | 1) => {
    if (!storageKey) return
    const currentValues = orderedOptions.map((option) => option.value)
    const currentIndex = currentValues.indexOf(optionValue)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentValues.length) return
    const nextValues = [...currentValues]
    const [moved] = nextValues.splice(currentIndex, 1)
    nextValues.splice(nextIndex, 0, moved)
    saveOrder(nextValues)
  }

  const handleDragStart = (event: DragEvent<HTMLSpanElement>, optionValue: string) => {
    if (!storageKey) return
    setDraggedValue(optionValue)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', optionValue)
  }

  const handleDragOver = (event: DragEvent<HTMLSpanElement>) => {
    if (!storageKey || !draggedValue) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent<HTMLSpanElement>, targetValue: string) => {
    event.preventDefault()
    if (!storageKey || !draggedValue || draggedValue === targetValue) {
      setDraggedValue(null)
      return
    }

    const currentValues = orderedOptions.map((option) => option.value)
    const fromIndex = currentValues.indexOf(draggedValue)
    const toIndex = currentValues.indexOf(targetValue)
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedValue(null)
      return
    }

    const nextValues = [...currentValues]
    const [moved] = nextValues.splice(fromIndex, 1)
    nextValues.splice(toIndex, 0, moved)
    saveOrder(nextValues)
    setDraggedValue(null)
  }

  return (
    <div className="inline-flex max-w-none flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
      <label className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {allLabel}
      </label>
      {orderedOptions.map((option, index) => (
        <span
          key={option.value}
          draggable={Boolean(storageKey)}
          onDragStart={(event) => handleDragStart(event, option.value)}
          onDragOver={handleDragOver}
          onDragEnd={() => setDraggedValue(null)}
          onDrop={(event) => handleDrop(event, option.value)}
          title={storageKey ? '拖动可调整筛选按钮顺序' : undefined}
          className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm ${
            storageKey ? 'cursor-grab active:cursor-grabbing' : ''
          } ${draggedValue === option.value ? 'opacity-50 ring-blue-300' : ''}`}
        >
          <label className="flex h-full items-center gap-1.5 whitespace-nowrap">
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => toggleOption(option.value)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {option.label}
          </label>
          {storageKey && (
            <span className="ml-0.5 inline-flex items-center gap-0.5 border-l border-gray-100 pl-1">
              <button
                type="button"
                aria-label={`${option.label}左移`}
                disabled={index === 0}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  moveOptionByStep(option.value, -1)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={`${option.label}右移`}
                disabled={index === orderedOptions.length - 1}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  moveOptionByStep(option.value, 1)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ›
              </button>
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
