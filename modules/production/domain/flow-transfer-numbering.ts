export function parseFlowTransferDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('转移日期格式不正确')
  return date
}
export function flowTransferNumberPrefix(date: Date) {
  const dateCode = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  return `FT-${dateCode}-`
}

export function nextFlowTransferNumber(date: Date, latestNo?: string | null) {
  const prefix = flowTransferNumberPrefix(date)
  const latestSequence = latestNo?.startsWith(prefix) ? Number(latestNo.slice(prefix.length)) : 0
  const base = Number.isInteger(latestSequence) && latestSequence > 0 ? latestSequence : 0
  return `${prefix}${String(base + 1).padStart(3, '0')}`
}
