'use client'

import type { TableSortDirection } from '../SortableTableHeader'

export default function ResourceSortButton({
  column,
  label,
  activeColumn,
  direction,
  onSort,
}: {
  column: string
  label: string
  activeColumn: string
  direction: TableSortDirection
  onSort: (column: string) => void
}) {
  const active = activeColumn === column

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 rounded hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={`按${label}${active && direction === 'asc' ? '降序' : '升序'}排列`}
    >
      <span>{label}</span>
      <span className={active ? 'text-blue-600' : 'text-gray-300'} aria-hidden="true">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}
