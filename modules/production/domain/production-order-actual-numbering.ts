import { ProductionOrderDomainError } from './production-order-errors'

export function parseProductionActualDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new ProductionOrderDomainError('生产日期格式不正确')
  return date
}

export function productionActualNoPrefix(date: Date) {
  return `PA-${[
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')}-`
}

export function parseProductionActualSequence(actualNo: string, date: Date) {
  const prefix = productionActualNoPrefix(date)
  const value = Number(actualNo.startsWith(prefix) ? actualNo.slice(prefix.length) : Number.NaN)
  if (!Number.isInteger(value) || value < 1) {
    throw new ProductionOrderDomainError('历史生产实绩编号损坏，无法生成新编号')
  }
  return value
}

export function buildProductionActualNo(date: Date, previousSequence: number) {
  if (!Number.isInteger(previousSequence) || previousSequence < 0) {
    throw new Error('上一条生产实绩序号必须是非负整数')
  }
  return `${productionActualNoPrefix(date)}${String(previousSequence + 1).padStart(3, '0')}`
}

export function productionActualDayRange(date: Date) {
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  return { start, end }
}
