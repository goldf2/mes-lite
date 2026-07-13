export function parseCsvFilter(value: string | null) {
  if (value === null) return []

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseStatusFilter(searchParams: URLSearchParams) {
  const statuses = searchParams.get('statuses')
  if (statuses !== null) {
    return parseCsvFilter(statuses)
  }

  const status = searchParams.get('status')
  return status ? [status] : []
}

export function applyStatusFilter(where: { status?: string | { in: string[] } }, statuses: string[]) {
  if (statuses.length === 1) {
    where.status = statuses[0]
  } else if (statuses.length > 1) {
    where.status = { in: statuses }
  }
}
