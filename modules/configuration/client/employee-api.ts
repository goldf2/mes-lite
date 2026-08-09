import type { EmployeeForm, EmployeeItem, EmployeeOperatorOption } from '../contracts/employee'

interface EmployeePayload<T> {
  data?: T
  operators?: EmployeeOperatorOption[]
  message?: string
  error?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as EmployeePayload<T>
  if (!response.ok) throw new Error(payload.error || '员工资料请求失败')
  return payload
}

export async function loadEmployees(keyword: string) {
  const params = new URLSearchParams({ includeInactive: '1' })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const payload = await request<EmployeeItem[]>(`/api/employees?${params}`)
  return { employees: payload.data || [], operators: payload.operators || [] }
}

export async function saveEmployee(form: EmployeeForm, id?: string) {
  const payload = await request<EmployeeItem>('/api/employees', {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { ...form, id } : form),
  })
  return { employee: payload.data, message: payload.message }
}
