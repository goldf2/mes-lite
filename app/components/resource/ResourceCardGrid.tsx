'use client'

import { GalleryHorizontal } from 'lucide-react'
import { KeyboardEvent, ReactNode } from 'react'

export default function ResourceCardGrid<T>({
  items,
  getKey,
  selectedKey,
  onSelect,
  renderCard,
  itemLabel,
  variant = 'card',
}: {
  items: T[]
  getKey: (item: T) => string
  selectedKey?: string | null
  onSelect?: (item: T) => void
  renderCard: (item: T) => ReactNode
  itemLabel?: (item: T) => string
  variant?: 'card' | 'columns' | 'gallery'
}) {
  const selectFromKeyboard = (event: KeyboardEvent<HTMLElement>, item: T) => {
    if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onSelect(item)
  }

  return (
    <div className={variant === 'columns'
      ? 'grid grid-cols-1 gap-2'
      : variant === 'gallery'
        ? 'grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'
        : 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'}>
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
            className={`overflow-hidden rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${onSelect ? 'cursor-pointer' : ''} ${selected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
          >
            {variant === 'gallery' && (
              <div aria-hidden="true" className={`flex aspect-[16/7] items-center justify-center border-b ${selected ? 'border-blue-200 bg-gradient-to-br from-blue-100 to-indigo-50 text-blue-600' : 'border-gray-100 bg-gradient-to-br from-gray-100 to-slate-50 text-gray-400'}`}>
                <GalleryHorizontal className="h-10 w-10" strokeWidth={1.35} />
              </div>
            )}
            <div className={variant === 'columns' ? 'p-3' : 'p-4'}>{renderCard(item)}</div>
          </article>
        )
      })}
    </div>
  )
}
