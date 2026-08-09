import type {
  CreateProductionOrdersInput,
  CreateProductionOrdersResult,
  ProductionOrder,
  ProductionOrderDetail,
  ProductionOrderMaterialOption,
} from '../contracts/production-order'

interface ApiPayload<T> {
  data?: T
  error?: string
  message?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T> & Partial<CreateProductionOrdersResult>
  if (!response.ok) throw new Error(payload.error || '生产订单请求失败')
  return payload
}

export async function loadProductionOrders(keyword: string, statuses: string[], allStatusCount: number) {
  const params = new URLSearchParams()
  if (statuses.length !== allStatusCount) params.set('statuses', statuses.length > 0 ? statuses.join(',') : '__NONE__')
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const payload = await request<ProductionOrder[]>(`/api/orders${params.size > 0 ? `?${params.toString()}` : ''}`)
  return payload.data || []
}

export async function loadProductionOrderOptions() {
  const payload = await request<ProductionOrderMaterialOption[]>('/api/orders/options')
  return payload.data || []
}

export async function loadProductionOrderDetail(orderId: string) {
  const payload = await request<ProductionOrderDetail>(`/api/orders/${encodeURIComponent(orderId)}`)
  return payload.data || null
}

export async function createProductionOrders(input: CreateProductionOrdersInput): Promise<CreateProductionOrdersResult> {
  const payload = await request<ProductionOrder>('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!payload.data) throw new Error('生产订单创建未返回结果')
  return {
    data: payload.data,
    items: payload.items || [payload.data],
    count: payload.count || 1,
    groupNo: payload.groupNo,
  }
}

export async function loadProductionOrderActuals<T>(orderId: string) {
  const payload = await request<T>(`/api/orders/${encodeURIComponent(orderId)}/actuals`)
  if (!payload.data) throw new Error('班后生产实绩未返回结果')
  return payload.data
}

export async function createProductionOrderActual(orderId: string, input: unknown) {
  return request<unknown>(`/api/orders/${encodeURIComponent(orderId)}/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function confirmProductionOrderActual(orderId: string, actualId: string) {
  return request<unknown>(`/api/orders/${encodeURIComponent(orderId)}/actuals/${encodeURIComponent(actualId)}/confirm`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
}

export async function deleteProductionOrderActual(orderId: string, actualId: string) {
  return request<unknown>(`/api/orders/${encodeURIComponent(orderId)}/actuals/${encodeURIComponent(actualId)}`, { method: 'DELETE' })
}

export async function reverseProductionOrderActual(orderId: string, actualId: string, reason: string) {
  return request<unknown>(`/api/orders/${encodeURIComponent(orderId)}/actuals/${encodeURIComponent(actualId)}/reverse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}
