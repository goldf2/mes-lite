import type { CompleteEquipmentInspectionInput, EquipmentInspectionPlanInput } from '../contracts/equipment-inspection-schema'
import type { EquipmentInspectionWorkspace } from '../contracts/equipment-inspection'

interface ApiPayload<T> {
  data?: T
  message?: string
  error?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '设备点检请求失败')
  return payload
}

export async function loadEquipmentInspections(filter: 'DUE' | 'ALL' | 'ABNORMAL', keyword: string) {
  const params = new URLSearchParams({ filter })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const payload = await request<EquipmentInspectionWorkspace>(`/api/equipment-inspections?${params}`)
  return payload.data!
}

export async function saveEquipmentInspectionPlan(input: EquipmentInspectionPlanInput) {
  const payload = await request('/api/equipment-inspections', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return payload.data
}

export async function changeEquipmentInspectionPlan(id: string, action: 'PAUSE' | 'RESUME') {
  const payload = await request(`/api/equipment-inspections/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }),
  })
  return payload.data
}

export async function completeEquipmentInspection(planId: string, input: CompleteEquipmentInspectionInput) {
  const payload = await request(`/api/equipment-inspections/${encodeURIComponent(planId)}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return payload.data
}
