export function dispatchNumberPrefix(date: Date) {
  return `DP-${date.toISOString().slice(0, 10).replace(/-/g, '')}-`
}
export function nextDispatchNumber(date: Date, latestNo?: string | null) {
  const prefix = dispatchNumberPrefix(date)
  const latestSequence = latestNo?.startsWith(prefix) ? Number(latestNo.slice(prefix.length)) : 0
  const base = Number.isInteger(latestSequence) && latestSequence > 0 ? latestSequence : 0
  return `${prefix}${String(base + 1).padStart(3, '0')}`
}
