import type {
  EquipmentForm,
  EquipmentItem,
  EquipmentWorkCenterOption,
  WorkCenterConfig,
  WorkCenterForm,
} from '../contracts/equipment'

interface ApiPayload<T> {
  data?: T
  message?: string
  error?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '设备请求失败')
  return payload
}

export async function loadEquipmentWorkCenters() {
  const payload = await request<EquipmentWorkCenterOption[]>('/api/work-centers')
  return payload.data || []
}

export async function loadEquipment(keyword: string) {
  const params = new URLSearchParams()
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const query = params.toString()
  const payload = await request<EquipmentItem[]>(query ? `/api/equipment?${query}` : '/api/equipment')
  return payload.data || []
}

export async function saveEquipment(form: EquipmentForm, id?: string) {
  const payload = await request<EquipmentItem>('/api/equipment', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { ...form, id } : form),
  })
  return payload.data
}

export async function archiveEquipment(id: string) {
  const payload = await request<never>(`/api/equipment?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return payload.message
}

export async function loadManagedWorkCenters() {
  const payload = await request<WorkCenterConfig[]>('/api/work-centers?includeInactive=1')
  return payload.data || []
}

export async function saveWorkCenter(form: WorkCenterForm, id?: string) {
  const payload = await request<WorkCenterConfig[]>('/api/work-centers', {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { ...form, id } : form),
  })
  return payload.data || []
}

export async function archiveWorkCenter(id: string) {
  const payload = await request<WorkCenterConfig[]>(`/api/work-centers?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return payload.data || []
}
