import type { WarehousePackage, WarehousePackageForm, WarehousePackageList, WarehousePackingOption, WarehousePackageLabelRevision } from '../contracts/warehouse-package'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json() as { data?: T; error?: string }
  if (!response.ok || payload.data === undefined) throw new Error(payload.error || '装箱记录请求失败')
  return payload.data
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function loadWarehousePackages(query: { keyword?: string; status?: string; page?: number; pageSize?: number; availableForShipment?: boolean; customerId?: string } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
  return request<WarehousePackageList>(`/api/warehouse-packages?${params}`)
}

export function loadWarehousePackingOptions(keyword = '') {
  return request<WarehousePackingOption[]>(`/api/warehouse-packages/options?${new URLSearchParams({ keyword })}`)
}

export function loadWarehousePackage(id: string) {
  return request<WarehousePackage>(`/api/warehouse-packages/${encodeURIComponent(id)}`)
}

export function createWarehousePackage(input: WarehousePackageForm) {
  return request<WarehousePackage>('/api/warehouse-packages', post(input))
}

export function voidWarehousePackage(id: string, reason: string) {
  return request<WarehousePackage>(`/api/warehouse-packages/${encodeURIComponent(id)}/void`, post({ reason }))
}

export function prepareWarehousePackageLabel(id: string) {
  return request<WarehousePackageLabelRevision>(`/api/warehouse-packages/${encodeURIComponent(id)}/labels`, post({}))
}

export function resolveWarehousePackage(code: string) {
  return request<WarehousePackage>(`/api/warehouse-packages/resolve?${new URLSearchParams({ code: code.trim(), available: 'true' })}`)
}
