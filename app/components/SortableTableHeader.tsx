'use client'

import { CSSProperties, ReactNode } from 'react'

export type TableSortDirection = 'asc' | 'desc'

export default function SortableTableHeader({
  column,
  activeColumn,
  direction,
  onSort,
  children,
  className = '',
  style,
}: {
  column: string
  activeColumn: string
  direction: TableSortDirection
  onSort: (column: string) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const active = column === activeColumn

  return (
    <th
      className={`px-4 py-3 text-left text-sm font-semibold text-gray-600 ${className}`}
      style={style}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded text-left hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={`按${String(children)}${active && direction === 'asc' ? '降序' : '升序'}排列`}
      >
        <span>{children}</span>
        <span className={active ? 'text-blue-600' : 'text-gray-300'} aria-hidden="true">
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}
