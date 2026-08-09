import type {
  ArchivedRecordsPayload,
  ArchiveModel,
  AuditLogRecord,
  MaterialCodeNormalizationPreview,
  MaterialCodeNormalizationResult,
} from '../contracts/maintenance'

interface ApiPayload<T> {
  data?: T
  error?: string
}

export class OperationsToolsRequestError<T = unknown> extends Error {
  constructor(message: string, readonly data?: T) {
    super(message)
    this.name = 'OperationsToolsRequestError'
  }
}

async function request<T, TError = unknown>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T | TError>
  if (!response.ok) throw new OperationsToolsRequestError<TError>(payload.error || '运维工具请求失败', payload.data as TError | undefined)
  return payload.data as T | undefined
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function loadArchivedRecords() {
  return await request<ArchivedRecordsPayload>('/api/deleted-records') || {}
}

export async function restoreArchivedRecord(model: ArchiveModel, id: string) {
  await request<unknown>('/api/restore', jsonRequest('PATCH', { model, id }))
}

export async function purgeArchivedRecord(model: ArchiveModel, id: string) {
  await request<unknown>('/api/deleted-records', jsonRequest('DELETE', { model, id, confirmation: '永久删除' }))
}

export async function loadAuditLogs(pageSize = 100) {
  return await request<AuditLogRecord[]>(`/api/audit-logs?pageSize=${pageSize}`) || []
}

export async function loadMaterialCodeNormalizationPreview() {
  return await request<MaterialCodeNormalizationPreview>('/api/system/material-code-normalization')
}

export async function executeMaterialCodeNormalization() {
  return await request<MaterialCodeNormalizationResult, MaterialCodeNormalizationPreview>(
    '/api/system/material-code-normalization',
    jsonRequest('POST', { confirmation: 'NORMALIZE_MATERIAL_CODES' }),
  )
}
