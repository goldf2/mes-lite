'use client'

import { KeyboardEvent, MouseEvent, ReactNode } from 'react'

export interface ResourceTableColumn<T> {
  key: string
  label: ReactNode
  render: (item: T) => ReactNode
  className?: string
  headerClassName?: string
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

const responsiveClasses = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

function clickedInteractiveElement(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'))
}

export default function ResourceTable<T>({
  items,
  columns,
  getKey,
  selectedKey,
  onSelect,
  rowLabel,
}: {
  items: T[]
  columns: ResourceTableColumn<T>[]
  getKey: (item: T) => string
  selectedKey?: string | null
  onSelect?: (item: T) => void
  rowLabel?: (item: T) => string
}) {
  const selectFromPointer = (event: MouseEvent<HTMLTableRowElement>, item: T) => {
    if (!onSelect || clickedInteractiveElement(event.target)) return
    onSelect(item)
  }

  const selectFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, item: T) => {
    if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onSelect(item)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-left text-sm sm:min-w-[680px]">
        <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-gray-200 px-4 py-3 ${column.hideBelow ? responsiveClasses[column.hideBelow] : ''} ${column.headerClassName || ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const key = getKey(item)
            const selected = key === selectedKey
            return (
              <tr
                key={key}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={rowLabel?.(item)}
                aria-selected={onSelect ? selected : undefined}
                onClick={(event) => selectFromPointer(event, item)}
                onKeyDown={(event) => selectFromKeyboard(event, item)}
                className={`${onSelect ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500' : ''} ${selected ? 'bg-blue-50/80' : 'bg-white hover:bg-gray-50'}`}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle text-gray-700 ${selected && columnIndex === 0 ? 'shadow-[inset_3px_0_0_#2563eb]' : ''} ${column.hideBelow ? responsiveClasses[column.hideBelow] : ''} ${column.className || ''}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
