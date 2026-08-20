import type {
  CustomerOption,
  InventoryLocationOption,
  MaterialInLineRecord,
  MaterialInConversionHistory,
  MaterialInRecord,
  MaterialInSavePayload,
  ReceivingMaterialOption,
  SupplierOption,
} from '../contracts/material-in'
import { materialInRecordMatchesSavePayload } from '../model/material-in-view'

class MaterialInNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaterialInNetworkError'
  }
}

function networkFailureMessage(fallback: string) {
  if (fallback === '创建来料单失败') {
    return '网络连接中断，无法确认来料单是否创建；请恢复网络后刷新列表，避免重复创建'
  }
  return `网络连接中断，${fallback}，请稍后重试`
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    throw new MaterialInNetworkError(networkFailureMessage(fallback))
  }
  let payload: Record<string, unknown>
  try {
    payload = await response.json() as Record<string, unknown>
  } catch {
    if (response.ok) throw new MaterialInNetworkError(networkFailureMessage(fallback))
    payload = {}
  }
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : fallback)
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

export async function getMaterialInRecord(id: string) {
  return requestJson<{ data: MaterialInRecord }>(`/api/material-ins/${id}`, undefined, '重新读取来料单失败')
}

export async function saveMaterialInRecord(id: string | null, payload: MaterialInSavePayload): Promise<{
  data: MaterialInRecord
  items?: MaterialInLineRecord[]
  count?: number
  recovered?: boolean
}> {
  try {
    return await requestJson<{ data: MaterialInRecord; items?: MaterialInLineRecord[]; count?: number }>(
      id ? `/api/material-ins/${id}` : '/api/material-ins',
      { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      id ? '修改来料单失败' : '创建来料单失败',
    )
  } catch (error) {
    if (!id || !(error instanceof MaterialInNetworkError)) throw error
    await new Promise((resolve) => globalThis.setTimeout(resolve, 300))
    try {
      const recovered = await getMaterialInRecord(id)
      if (materialInRecordMatchesSavePayload(recovered.data, payload)) {
        return { data: recovered.data, recovered: true }
      }
    } catch {
      // 保留原草稿；只读回查失败时不能自动重发写请求。
    }
    throw new Error('网络连接中断，暂时无法确认来料单是否保存；当前窗口内容已保留，请待网络恢复后再保存，勿连续点击')
  }
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
