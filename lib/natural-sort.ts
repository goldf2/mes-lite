export type SortDirection = 'asc' | 'desc'

const naturalTextCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

export function compareNaturalText(left: string, right: string) {
  const naturalResult = naturalTextCollator.compare(left, right)
  if (naturalResult !== 0) return naturalResult
  return left.localeCompare(right, 'zh-CN')
}

export function sortByNaturalText<T>(
  rows: T[],
  selectText: (row: T) => string,
  direction: SortDirection,
) {
  const directionFactor = direction === 'asc' ? 1 : -1
  return [...rows].sort(
    (left, right) => directionFactor * compareNaturalText(selectText(left), selectText(right)),
  )
}
