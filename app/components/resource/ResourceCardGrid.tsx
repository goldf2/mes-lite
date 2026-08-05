'use client'

import { KeyboardEvent, ReactNode } from 'react'

export default function ResourceCardGrid<T>({
  items,
  getKey,
  selectedKey,
  onSelect,
  renderCard,
  itemLabel,
}: {
  items: T[]
  getKey: (item: T) => string
  selectedKey?: string | null
  onSelect?: (item: T) => void
  renderCard: (item: T) => ReactNode
  itemLabel?: (item: T) => string
}) {
  const selectFromKeyboard = (event: KeyboardEvent<HTMLElement>, item: T) => {
    if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onSelect(item)
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => {
        const key = getKey(item)
        const selected = key === selectedKey
        return (
          <article
            key={key}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={itemLabel?.(item)}
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => selectFromKeyboard(event, item)}
            className={`rounded-lg border p-4 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${onSelect ? 'cursor-pointer' : ''} ${selected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
          >
            {renderCard(item)}
          </article>
        )
      })}
    </div>
  )
}
