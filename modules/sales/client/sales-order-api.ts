import type {
  CreateSalesOrderInput,
  SalesOrder,
  SalesOrderOptions,
  UpdateSalesOrderPricesInput,
} from '../contracts/sales-order'

interface ApiPayload<T> {
  data?: T
  message?: string
  error?: string
  customers?: SalesOrderOptions['customers']
  materials?: SalesOrderOptions['materials']
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '请求失败')
  return payload
}

const jsonRequest = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function loadSalesOrders(params: URLSearchParams) {
  const payload = await request<SalesOrder[]>(`/api/sales-orders?${params}`)
  return payload.data || []
}

export async function loadSalesOrderOptions(): Promise<SalesOrderOptions> {
  const payload = await request<never>('/api/sales-orders/options')
  return { customers: payload.customers || [], materials: payload.materials || [] }
}

export async function createSalesOrder(input: CreateSalesOrderInput) {
  const payload = await request<SalesOrder>('/api/sales-orders', jsonRequest('POST', input))
  if (!payload.data) throw new Error('销售订单返回为空')
  return payload.data
}

export function updateSalesOrderStatus(id: string, action: 'confirm' | 'cancel') {
  return request<never>(`/api/sales-orders/${id}/${action}`, { method: 'PATCH' })
}

export function updateSalesOrderPrices(id: string, input: UpdateSalesOrderPricesInput) {
  return request<never>(`/api/sales-orders/${id}/prices`, jsonRequest('PATCH', input))
}
