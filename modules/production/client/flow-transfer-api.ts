import type {
  FlowTransferEmployeeOption,
  FlowTransferForm,
  FlowTransferLocationOption,
  FlowTransferMaterialOption,
  FlowTransferRecord,
} from '../contracts/flow-transfer'

interface FlowTransferPayload<T> {
  data?: T
  message?: string
  error?: string
  materials?: FlowTransferMaterialOption[]
  locations?: FlowTransferLocationOption[]
  employees?: FlowTransferEmployeeOption[]
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as FlowTransferPayload<T>
  if (!response.ok) throw new Error(payload.error || '流程转移请求失败')
  return payload
}

const jsonRequest = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function loadFlowTransfers(params: URLSearchParams) {
  const query = params.toString()
  const payload = await request<FlowTransferRecord[]>(query ? `/api/flow-transfers?${query}` : '/api/flow-transfers')
  return {
    transfers: payload.data || [],
    materials: payload.materials || [],
    locations: payload.locations || [],
    employees: payload.employees || [],
  }
}

export async function saveFlowTransfer(form: FlowTransferForm, id?: string) {
  const payload = await request<FlowTransferRecord>(
    id ? `/api/flow-transfers/${id}` : '/api/flow-transfers',
    jsonRequest(id ? 'PATCH' : 'POST', { ...form, quantity: Number(form.quantity) }),
  )
  if (!payload.data) throw new Error('流程转移返回为空')
  return { transfer: payload.data, message: payload.message }
}

export async function confirmFlowTransfer(id: string) {
  const payload = await request<FlowTransferRecord>(`/api/flow-transfers/${id}/confirm`, jsonRequest('PATCH', {}))
  return payload.message
}

export async function reverseFlowTransfer(id: string, reason: string) {
  const payload = await request<FlowTransferRecord>(`/api/flow-transfers/${id}/reverse`, jsonRequest('PATCH', { reason }))
  return payload.message
}
