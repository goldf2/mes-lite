'use client'

import type { ReactNode } from 'react'
import type { TableSortDirection } from '../SortableTableHeader'

export default function ResourceSortLabel({
  column,
  activeColumn,
  direction,
  onSort,
  children,
}: {
  column: string
  activeColumn: string
  direction: TableSortDirection
  onSort: (column: string) => void
  children: ReactNode
}) {
  const active = column === activeColumn
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 rounded text-left hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={`按${String(children)}${active && direction === 'asc' ? '降序' : '升序'}排列`}
    >
      <span>{children}</span>
      <span className={active ? 'text-blue-600' : 'text-gray-300'} aria-hidden="true">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}
