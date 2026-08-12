interface QualityInspectionApiPayload<T> {
  data?: T
  message?: string
  error?: string
}

import type { QualityTaskFilter, QualityTaskWorkspace } from '../contracts/quality-task'

export async function loadQualityTasks(filter: QualityTaskFilter, keyword: string): Promise<QualityTaskWorkspace> {
  const params = new URLSearchParams({ filter })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const response = await fetch(`/api/quality-inspections?${params.toString()}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '获取质量任务失败')
  return payload as QualityTaskWorkspace
}

export async function decideQualityInspection(inspectionId: string, input: unknown) {
  const response = await fetch(`/api/quality-inspections/${encodeURIComponent(inspectionId)}/decision`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json() as QualityInspectionApiPayload<unknown>
  if (!response.ok) throw new Error(payload.error || '保存质量判定失败')
  return payload
}

export async function disposeQualityInspection(inspectionId: string, input: unknown) {
  const response = await fetch(`/api/quality-inspections/${encodeURIComponent(inspectionId)}/dispositions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json() as QualityInspectionApiPayload<unknown>
  if (!response.ok) throw new Error(payload.error || '保存质量处置失败')
  return payload
}
