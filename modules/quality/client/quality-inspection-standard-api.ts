import type { QualityInspectionStandardInput } from '../contracts/quality-inspection-standard-schema'
import type {
  QualityInspectionStandardView,
  QualityInspectionStandardWorkspace,
  QualityTrendWorkspace,
} from '../contracts/quality-inspection-standard'
import type { ResourceSearchCondition } from '@/lib/resource-search'

interface ApiPayload<T> {
  data?: T
  error?: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok || payload.data === undefined) throw new Error(payload.error || '请求处理失败')
  return payload.data
}

export async function loadQualityInspectionStandards(keyword = '', status = '', conditions: readonly ResourceSearchCondition[] = []) {
  const params = new URLSearchParams()
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (status) params.set('status', status)
  if (conditions.length) params.set('advanced', JSON.stringify(conditions.map(({ field, operator, value }) => ({ field, operator, value }))))
  return request<QualityInspectionStandardWorkspace>(`/api/quality-inspection-standards?${params.toString()}`)
}

export async function saveQualityInspectionStandard(input: QualityInspectionStandardInput, id?: string) {
  return request<QualityInspectionStandardView>(id ? `/api/quality-inspection-standards/${encodeURIComponent(id)}` : '/api/quality-inspection-standards', {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

export async function copyQualityInspectionStandard(id: string, changeReason: string) {
  return request<QualityInspectionStandardView>(`/api/quality-inspection-standards/${encodeURIComponent(id)}/copy`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changeReason }),
  })
}

export async function releaseQualityInspectionStandard(id: string) {
  return request<QualityInspectionStandardView>(`/api/quality-inspection-standards/${encodeURIComponent(id)}/release`, { method: 'POST' })
}

export async function obsoleteQualityInspectionStandard(id: string, reason: string) {
  return request<QualityInspectionStandardView>(`/api/quality-inspection-standards/${encodeURIComponent(id)}/obsolete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  })
}

export async function loadQualityTrends(input: { startDate: string; endDate: string; materialId?: string; sourceType?: string }) {
  const params = new URLSearchParams({
    startDate: new Date(`${input.startDate}T00:00:00`).toISOString(),
    endDate: new Date(`${input.endDate}T23:59:59.999`).toISOString(),
  })
  if (input.materialId) params.set('materialId', input.materialId)
  if (input.sourceType) params.set('sourceType', input.sourceType)
  return request<QualityTrendWorkspace>(`/api/quality-inspections/trends?${params.toString()}`)
}
