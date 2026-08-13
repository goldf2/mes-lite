import type {
  CustomerOption,
  InventoryLocationOption,
  MaterialInLineRecord,
  MaterialInConversionHistory,
  MaterialInRecord,
  ReceivingMaterialOption,
  SupplierOption,
} from '../contracts/material-in'

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(input, init)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload as T
}

export async function listMaterialInRecords(params: URLSearchParams) {
  const suffix = params.toString()
  return requestJson<{ data: MaterialInRecord[] }>(`/api/material-ins${suffix ? `?${suffix}` : ''}`, undefined, '获取来料单列表失败')
}

export async function listReceivingLocations() {
  return requestJson<{ data: InventoryLocationOption[] }>('/api/inventory-locations?context=material-in', undefined, '获取库位失败')
}

export async function listReceivingCustomers() {
  return requestJson<{ data: CustomerOption[] }>('/api/customers', undefined, '获取客户失败')
}

export async function listReceivingSuppliers(keyword = '') {
  const params = new URLSearchParams()
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const suffix = params.toString()
  return requestJson<{ data: SupplierOption[] }>(`/api/suppliers${suffix ? `?${suffix}` : ''}`, undefined, '获取供应商失败')
}

export async function listReceivingMaterials(keyword = '') {
  const params = new URLSearchParams({ pageSize: '50', sortBy: 'code', sortDir: 'asc' })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  return requestJson<{ data: ReceivingMaterialOption[] }>(`/api/materials?${params.toString()}`, undefined, '获取物料失败')
}

export async function getMaterialInConversionHistory(materialId: string) {
  const params = new URLSearchParams({ materialId })
  return requestJson<{ data: MaterialInConversionHistory }>(`/api/material-ins/conversion-history?${params.toString()}`, undefined, '获取物料历史换算失败')
}

export async function saveMaterialInRecord(id: string | null, payload: Record<string, unknown>) {
  return requestJson<{ data: MaterialInRecord; items?: MaterialInLineRecord[]; count?: number }>(
    id ? `/api/material-ins/${id}` : '/api/material-ins',
    { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    id ? '修改来料单失败' : '创建来料单失败',
  )
}

export async function receiveMaterialInRecord(id: string) {
  return requestJson<{ message?: string }>(`/api/material-ins/${id}/receive`, { method: 'PATCH' }, '收货失败')
}

export async function rejectMaterialInRecord(id: string) {
  return requestJson<{ message?: string }>(`/api/material-ins/${id}/reject`, { method: 'PATCH' }, '拒收失败')
}

export async function reverseMaterialInRecord(id: string, reason: string) {
  return requestJson<{ message?: string }>(
    `/api/material-ins/${id}/reverse`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) },
    '红冲失败',
  )
}
