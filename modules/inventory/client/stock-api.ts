import type {
  Customer,
  InventoryLocationOption,
  Stock,
  StockAdjustmentInput,
  StockIntegrityIssue,
  StockQuery,
} from '../contracts/stock'

export interface StockQueryResult {
  ok: boolean
  status: number
  data: Stock[]
  error: string
  issues: StockIntegrityIssue[]
}

export async function loadStocks(query: StockQuery): Promise<StockQueryResult> {
  const params = new URLSearchParams()
  if (query.keyword.trim()) params.set('keyword', query.keyword.trim())
  if (query.customerId) params.set('customerId', query.customerId)
  if (query.locationId) params.set('locationId', query.locationId)
  if (query.categories.length !== query.allCategories.length) {
    params.set('categories', query.categories.length > 0 ? query.categories.join(',') : '__NONE__')
  }
  if (query.includeInvalid) params.set('includeInvalid', '1')
  if (query.advancedConditions?.length) params.set('advanced', JSON.stringify(query.advancedConditions))

  const queryString = params.toString()
  const response = await fetch(`/api/stocks${queryString ? `?${queryString}` : ''}`)
  const payload = await response.json()
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok && Array.isArray(payload.data) ? payload.data : [],
    error: payload.error || '库存数据异常',
    issues: Array.isArray(payload.issues) ? payload.issues : [],
  }
}

export async function repairMissingStockRecords() {
  const response = await fetch('/api/stocks', { method: 'PATCH' })
  const payload = await response.json()
  return { ok: response.ok, message: payload.message || payload.error || (response.ok ? '库存余额已补齐' : '补齐库存余额失败') }
}

export async function loadStockCustomers(): Promise<Customer[]> {
  const response = await fetch('/api/customers')
  if (!response.ok) return []
  const payload = await response.json()
  return Array.isArray(payload.data) ? payload.data : []
}

export async function loadInventoryLocations(): Promise<InventoryLocationOption[]> {
  const response = await fetch('/api/inventory-locations?context=stocks')
  if (!response.ok) return []
  const payload = await response.json()
  return Array.isArray(payload.data) ? payload.data : []
}

export async function submitStockAdjustment(input: StockAdjustmentInput) {
  const response = await fetch('/api/stocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json()
  return { ok: response.ok, message: payload.message || payload.error || (response.ok ? '存货调整完成' : '存货调整失败') }
}
