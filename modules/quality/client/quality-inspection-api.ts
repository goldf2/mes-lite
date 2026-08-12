interface QualityInspectionApiPayload<T> {
  data?: T
  message?: string
  error?: string
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
