'use client'

import { useMemo, useState } from 'react'
import { TableSortDirection } from './SortableTableHeader'

type SortValue = string | number | boolean | Date | null | undefined
type SortAccessors<Row> = Record<string, (row: Row) => SortValue>

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

function compareValues(left: SortValue, right: SortValue) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (left instanceof Date || right instanceof Date) {
    return new Date(left as Date | string | number).getTime() - new Date(right as Date | string | number).getTime()
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return collator.compare(String(left), String(right))
}

export default function useClientTableSort<Row>(
  rows: Row[],
  accessors: SortAccessors<Row>,
  defaultColumn: string,
  defaultDirection: TableSortDirection = 'asc'
) {
  const [sortColumn, setSortColumn] = useState(defaultColumn)
  const [sortDirection, setSortDirection] = useState<TableSortDirection>(defaultDirection)

  const sortedRows = useMemo(() => {
    const accessor = accessors[sortColumn]
    if (!accessor) return rows
    const multiplier = sortDirection === 'asc' ? 1 : -1
    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const compared = compareValues(accessor(left.row), accessor(right.row))
        return compared === 0 ? left.index - right.index : compared * multiplier
      })
      .map(({ row }) => row)
  }, [accessors, rows, sortColumn, sortDirection])

  const toggleSort = (column: string) => {
    if (column === sortColumn) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  return { sortedRows, sortColumn, sortDirection, toggleSort }
}
