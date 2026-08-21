import type {
  DispatchCustomer,
  DispatchEmployeeOption,
  DispatchFormInput,
  DispatchOrder,
  DispatchProcessStep,
  DispatchRecord,
} from '../contracts/dispatch'
import type { ResourceSearchCondition } from '@/lib/resource-search'

async function responseData<T>(response: Response): Promise<{ ok: boolean; data?: T; error?: string; message?: string }> {
  const payload = await response.json()
  return { ok: response.ok, ...payload }
}

export async function listDispatchEmployees() {
  const response = await fetch('/api/dispatches?options=employees')
  if (!response.ok) throw new Error('获取生产员工失败')
  return ((await response.json()).data || []) as DispatchEmployeeOption[]
}

export async function listDispatches(selectedStatuses: string[], allStatuses: string[], customerId: string, keyword = '', conditions: readonly ResourceSearchCondition[] = []) {
  const params = new URLSearchParams()
  if (selectedStatuses.length !== allStatuses.length) {
    params.set('statuses', selectedStatuses.length > 0 ? selectedStatuses.join(',') : '__NONE__')
  }
  if (customerId) params.set('customerId', customerId)
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (conditions.length > 0) params.set('advanced', JSON.stringify(conditions))
  const response = await fetch(params.size > 0 ? `/api/dispatches?${params}` : '/api/dispatches')
  if (!response.ok) throw new Error('获取派工单列表失败')
  return ((await response.json()).data || []) as DispatchRecord[]
}

export async function listDispatchOrders(customerId: string) {
  const params = new URLSearchParams({ statuses: 'RELEASED,IN_PROGRESS' })
  if (customerId) params.set('customerId', customerId)
  const response = await fetch(`/api/orders?${params}`)
  if (!response.ok) throw new Error('获取可派工工单失败')
  return ((await response.json()).data || []) as DispatchOrder[]
}

export async function listDispatchCustomers() {
  const response = await fetch('/api/customers')
  if (!response.ok) throw new Error('获取客户失败')
  return ((await response.json()).data || []) as DispatchCustomer[]
}

export async function listDispatchOrderSteps(orderId: string) {
  if (!orderId) return []
  const response = await fetch(`/api/orders/${orderId}`)
  if (!response.ok) throw new Error('获取工序失败')
  return ((await response.json()).data?.routeSteps || []) as DispatchProcessStep[]
}

export function createDispatch(input: DispatchFormInput) {
  return fetch('/api/dispatches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }).then((response) => responseData<DispatchRecord>(response))
}

export function transitionDispatch(id: string, action: 'dispatch' | 'start' | 'complete') {
  return fetch(`/api/dispatches/${id}/${action}`, { method: 'PATCH' })
    .then((response) => responseData<DispatchRecord>(response))
}
