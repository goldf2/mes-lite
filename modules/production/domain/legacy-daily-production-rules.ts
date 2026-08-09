import { LegacyDailyProductionError } from './legacy-daily-production-errors'

export const roundLegacyDailyProductionQty = (value: number) => Number(value.toFixed(6))

export function parseLegacyDailyProductionReportDate(value: string) {
  const normalized = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) throw new LegacyDailyProductionError('生产日期格式不正确')
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) {
    throw new LegacyDailyProductionError('生产日期格式不正确')
  }
  return date
}

export function legacyDailyProductionDateCode(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
}

export function buildLegacyDailyProductionReportNo(date: Date, existingNumbers: string[]) {
  const dateCode = legacyDailyProductionDateCode(date)
  const prefix = `PR-${dateCode}-`
  const largest = existingNumbers.reduce((current, reportNo) => {
    if (!reportNo.startsWith(prefix)) return current
    const sequence = Number(reportNo.slice(prefix.length))
    return Number.isInteger(sequence) && sequence > current ? sequence : current
  }, 0)
  return `${prefix}${String(largest + 1).padStart(3, '0')}`
}

export function assertLegacyDailyProductionDraft(status: string, action: '修改' | '确认') {
  if (status === 'DRAFT') return
  if (action === '修改') throw new LegacyDailyProductionError('只有草稿生产记录可以修改；已确认记录请先冲销')
  throw new LegacyDailyProductionError('只有草稿生产记录可以确认')
}

export function assertLegacyDailyProductionConfirmed(status: string) {
  if (status !== 'CONFIRMED') throw new LegacyDailyProductionError('只有已确认生产记录可以冲销')
}
