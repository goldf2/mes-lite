import type {
  FulfillmentCustomer,
  InventoryLocationOption,
  ReturnMaterialOption,
  ReturnForm,
  ReturnOrder,
  ReturnShipmentOption,
  Shipment,
  ShipmentCreated,
  ShipmentForm,
  ShipmentMaterialOption,
  ShippableSalesItem,
} from '../contracts/fulfillment'

interface ApiPayload<T> {
  data?: T
  message?: string
  error?: string
  customers?: FulfillmentCustomer[]
  materials?: ShipmentMaterialOption[]
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '请求失败')
  return payload
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function loadShipments(params: URLSearchParams) {
  const payload = await request<Shipment[]>(params.size ? `/api/shipments?${params}` : '/api/shipments')
  return { shipments: payload.data || [], customers: payload.customers || [] }
}

export function transitionShipment(id: string, action: 'ship' | 'deliver' | 'cancel', input?: { reason: string }) {
  return request<never>(`/api/shipments/${id}/${action}`, {
    method: 'PATCH',
    ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
}

export async function loadShipmentCreateOptions() {
  const [items, locations] = await Promise.all([
    request<ShippableSalesItem[]>('/api/sales-orders/shippable'),
    request<InventoryLocationOption[]>('/api/inventory-locations?context=shipment'),
  ])
  return {
    items: items.data || [],
    customers: items.customers || [],
    materials: items.materials || [],
    locations: locations.data || [],
  }
}

export async function createShipment(input: ShipmentForm) {
  const payload = await request<ShipmentCreated>('/api/shipments', jsonPost({
    ...input,
    trackingNo: input.trackingNo || undefined,
    shippedBy: input.shippedBy || undefined,
    note: input.note || undefined,
  }))
  if (!payload.data) throw new Error('发货单返回为空')
  return payload.data
}

export async function loadReturns(params: URLSearchParams) {
  const payload = await request<ReturnOrder[]>(params.size ? `/api/returns?${params}` : '/api/returns')
  return payload.data || []
}

export async function loadReturnOptions() {
  const [customers, products, locations, shipments] = await Promise.all([
    request<FulfillmentCustomer[]>('/api/customers'),
    request<ReturnMaterialOption[]>('/api/products'),
    request<InventoryLocationOption[]>('/api/inventory-locations?context=return'),
    request<ReturnShipmentOption[]>('/api/returns/options'),
  ])
  return {
    customers: customers.data || [],
    products: products.data || [],
    locations: locations.data || [],
    shipments: shipments.data || [],
  }
}

export async function createReturn(input: ReturnForm) {
  const payload = await request<ReturnOrder>('/api/returns', jsonPost({
    ...input,
    voucherNo: input.voucherNo || undefined,
    note: input.note || undefined,
  }))
  if (!payload.data) throw new Error('退货单返回为空')
  return payload.data
}

export function transitionReturn(id: string, action: 'process' | 'reject', input?: { reason: string }) {
  return request<never>(`/api/returns/${id}/${action}`, {
    method: 'PATCH',
    ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
}
