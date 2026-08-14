import type {
  CompleteEquipmentMaintenanceWorkOrderInput,
  CreateCorrectiveMaintenanceWorkOrderInput,
  EquipmentMaintenancePlanInput,
} from '../contracts/equipment-maintenance-schema'
import type { EquipmentMaintenanceWorkspace } from '../contracts/equipment-maintenance'

interface ApiPayload<T> { data?: T; error?: string }

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '设备维保请求失败')
  return payload.data!
}

const json = (method: string, body?: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export function loadEquipmentMaintenance(filter: 'DUE' | 'OPEN' | 'HISTORY' | 'ALL', keyword: string) {
  const params = new URLSearchParams({ filter })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  return request<EquipmentMaintenanceWorkspace>(`/api/equipment-maintenance?${params}`)
}

export function saveEquipmentMaintenancePlan(input: EquipmentMaintenancePlanInput) {
  return request('/api/equipment-maintenance/plans', json('POST', input))
}

export function changeEquipmentMaintenancePlan(id: string, action: 'PAUSE' | 'RESUME') {
  return request(`/api/equipment-maintenance/plans/${encodeURIComponent(id)}`, json('PATCH', { action }))
}

export function generatePreventiveMaintenanceWorkOrder(planId: string, assignedTo?: string | null) {
  return request(`/api/equipment-maintenance/plans/${encodeURIComponent(planId)}/work-orders`, json('POST', { operationId: crypto.randomUUID(), assignedTo: assignedTo || null }))
}

export function saveCorrectiveMaintenanceWorkOrder(input: CreateCorrectiveMaintenanceWorkOrderInput) {
  return request('/api/equipment-maintenance/work-orders', json('POST', input))
}

export function startEquipmentMaintenanceWorkOrder(id: string) {
  return request(`/api/equipment-maintenance/work-orders/${encodeURIComponent(id)}/start`, json('POST'))
}

export function completeEquipmentMaintenanceWorkOrder(id: string, input: CompleteEquipmentMaintenanceWorkOrderInput) {
  return request(`/api/equipment-maintenance/work-orders/${encodeURIComponent(id)}/complete`, json('POST', input))
}

export function cancelEquipmentMaintenanceWorkOrder(id: string, reason: string) {
  return request(`/api/equipment-maintenance/work-orders/${encodeURIComponent(id)}/cancel`, json('POST', { reason }))
}
