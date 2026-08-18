import { SalesDomainError } from './sales-errors'

export function parseSalesDate(value: string, field: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new SalesDomainError(`${field}格式不正确`)
  return date
}

export function datedDocumentPrefix(kind: 'SO' | 'SH' | 'RT' | 'BX', date: Date) {
  return `${kind}-${date.toISOString().slice(0, 10).replace(/-/g, '')}-`
}

export function nextDatedDocumentNo(kind: 'SO' | 'SH' | 'RT' | 'BX', date: Date, latestNo?: string | null) {
  const prefix = datedDocumentPrefix(kind, date)
  const latestSequence = latestNo?.startsWith(prefix) ? Number(latestNo.slice(prefix.length)) : 0
  const sequence = Number.isInteger(latestSequence) && latestSequence > 0 ? latestSequence + 1 : 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}
