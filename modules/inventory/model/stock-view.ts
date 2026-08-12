import type { Stock, StockIntegrityIssue } from '../contracts/stock'

const repairableStockIssueTypes = new Set(['MATERIAL_WITHOUT_STOCK'])

export function canBackfillStockIssues(issues: StockIntegrityIssue[]) {
  return issues.length > 0 && issues.every((issue) => Boolean(issue.type && repairableStockIssueTypes.has(issue.type)))
}

export function stockQuantityText(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

export const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

export const materialCategoryOptions = [
  ['RAW', '原材料'],
  ['FINISHED', '成品'],
  ['AUXILIARY', '辅材'],
  ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'],
  ['PACKAGING', '包装物'],
  ['OTHER', '其他'],
] as const

export const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

export function occupiedStockLocations(stock: Stock, includeReserved = false) {
  return stock.locationBalances.filter((balance) => (
    Math.abs(Number(balance.qty)) > 0.000001
    || (includeReserved && Math.abs(Number(balance.reservedQty)) > 0.000001)
  ))
}

export function stockUnit(stock: Stock) {
  return stock.material?.stockUnit || stock.product?.unit || ''
}

export function stockDisplayName(stock: Stock) {
  return stock.material?.name || stock.product?.name || ''
}

export function stockDisplayCode(stock: Stock) {
  return stock.material?.code || stock.product?.sku || ''
}

export function createStockAdjustmentDraft(stock: Stock, locationId: string) {
  const balance = stock.locationBalances.find((item) => item.locationId === locationId)
  return {
    locationId,
    newLocationQty: Number(balance?.qty || 0),
    newValuationQty: Number(stock.valuationQty || 0),
    newTotalCost: Number(stock.totalCost || 0),
    reason: '',
  }
}

export function adjustedTotalQuantity(stock: Stock, locationId: string, newLocationQty: number) {
  return Number((
    Number(stock.qty)
    - Number(stock.locationBalances.find((item) => item.locationId === locationId)?.qty || 0)
    + Number(newLocationQty || 0)
  ).toFixed(6))
}
