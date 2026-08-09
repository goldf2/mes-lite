export function materialInNumberPrefix(date: Date) {
  return `IN-${date.toISOString().slice(0, 10).replace(/-/g, '')}-`
}

export function nextMaterialInNumber(date: Date, latestNo?: string | null, offset = 0) {
  const prefix = materialInNumberPrefix(date)
  const latestSequence = latestNo?.startsWith(prefix) ? Number(latestNo.slice(prefix.length)) : 0
  const base = Number.isInteger(latestSequence) && latestSequence > 0 ? latestSequence : 0
  return `${prefix}${String(base + offset + 1).padStart(3, '0')}`
}
