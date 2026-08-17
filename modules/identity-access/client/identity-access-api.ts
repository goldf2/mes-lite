import type {
  CreatePermissionGroupInput,
  PermissionAdministrationData,
  PermissionGroup,
  UpdatePermissionsInput,
} from '../contracts/permission-admin'
import type { OperatorAdminItem, ResetOperatorPasswordInput, UpdateOperatorInput } from '../contracts/operator-admin'

interface ApiResponse<T> {
  data?: T
  message?: string
  error?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiResponse<T>
  if (!response.ok) throw new Error(payload.error || '请求失败')
  return payload
}

const jsonRequest = (method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function loadPermissionAdministration() {
  const payload = await request<PermissionAdministrationData>('/api/permissions')
  if (!payload.data) throw new Error('权限数据为空')
  return payload.data
}

export function savePermissionAdministration(input: UpdatePermissionsInput) {
  return request<never>('/api/permissions', jsonRequest('PUT', input))
}

export function createPermissionGroup(input: CreatePermissionGroupInput) {
  return request<PermissionGroup>('/api/permissions', jsonRequest('POST', input))
}

export async function loadOperators(statusQuery = '') {
  const payload = await request<OperatorAdminItem[]>(statusQuery ? `/api/operators?${statusQuery}` : '/api/operators')
  return payload.data || []
}

export function updateOperator(input: UpdateOperatorInput) {
  return request<OperatorAdminItem>('/api/operators', jsonRequest('PATCH', input))
}

export function deleteOperator(id: string) {
  return request<OperatorAdminItem>(`/api/operators?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function resetOperatorPassword(input: ResetOperatorPasswordInput) {
  return request<OperatorAdminItem>('/api/operators/password', jsonRequest('POST', input))
}
