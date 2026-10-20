import {
  attachmentFileUrl as buildAttachmentFileUrl,
  attachmentPreviewUrl as buildAttachmentPreviewUrl,
  attachmentThumbnailUrl as buildAttachmentThumbnailUrl,
  withAttachmentUrls,
} from '@/lib/attachment-urls'
import type {
  TaskCollaborationStatus,
  TaskDeliveryMethod,
  TaskDeliveryRecord,
  TaskDeliveryStatus,
  TaskDraftInput,
  TaskErrorCode,
  TaskListResponse,
  TaskOptionItem,
  TaskOptionType,
  TaskPatchInput,
  TaskProgressKind,
  TaskRecipient,
  TaskRecord,
  TaskReleaseManifest,
  TaskReleasePreviewResponse,
  TaskReleaseRecord,
} from '../contracts/task-collaboration'
import {
  normalizeReleaseManifest,
  normalizeReleasePreviewResponse,
  normalizeTaskRecord,
} from '../model/task-collaboration-view'

const BASE_PATH = '/api/task-collaboration'

export class TaskCollaborationApiError extends Error {
  readonly status: number
  readonly code: TaskErrorCode
  readonly details?: unknown

  constructor(message: string, status: number, code: TaskErrorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message)
    this.name = 'TaskCollaborationApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ApiErrorPayload {
  error?: string
  code?: TaskErrorCode
  details?: unknown
}

function hydrateAttachmentUrlsHelper(attachment: {
  id: string
  originalName: string
  mimeType: string
  size: number
  rotation: number
  previewRevision?: number | null
}) {
  try {
    return withAttachmentUrls({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      rotation: attachment.rotation,
      ...(attachment.previewRevision !== null && attachment.previewRevision !== undefined
        ? { previewRevision: attachment.previewRevision }
        : {}),
    })
  } catch {
    return {
      url: buildAttachmentFileUrl(attachment.id),
      originalUrl: buildAttachmentFileUrl(attachment.id),
      previewUrl: buildAttachmentPreviewUrl(attachment.id),
      thumbnailUrl: buildAttachmentThumbnailUrl(attachment.id),
    }
  }
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorPayload
  if (!response.ok) {
    const defaultCode: TaskErrorCode =
      response.status === 401
        ? 'UNAUTHENTICATED'
        : response.status === 403
          ? 'PERMISSION_DENIED'
          : response.status === 404
            ? 'NOT_FOUND'
            : response.status === 409
              ? 'VERSION_CONFLICT'
              : response.status === 400
                ? 'VALIDATION_ERROR'
                : 'INTERNAL_ERROR'
    throw new TaskCollaborationApiError(
      body.error || fallbackMessage,
      response.status,
      body.code || defaultCode,
      body.details,
    )
  }
  return body
}

export function createOperationId(prefix = 'tc-op'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function attachmentFileUrl(attachmentId: string): string {
  return buildAttachmentFileUrl(attachmentId)
}

export async function listTasks(params: {
  keyword?: string
  status?: TaskCollaborationStatus | ''
  archived?: boolean
  page?: number
  pageSize?: number
  signal?: AbortSignal
}): Promise<TaskListResponse> {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)))
  const search = new URLSearchParams()
  if (params.keyword?.trim()) search.set('keyword', params.keyword.trim())
  if (params.status) search.set('status', params.status)
  search.set('archived', params.archived ? '1' : '0')
  search.set('page', String(page))
  search.set('pageSize', String(pageSize))

  const response = await fetch(`${BASE_PATH}?${search.toString()}`, {
    method: 'GET',
    signal: params.signal,
  })
  const raw = await parseResponse<{
    data?: unknown[]
    pagination?: { page?: number; pageSize?: number; total?: number; totalPages?: number }
  }>(response, '加载任务协同列表失败')

  const data = (Array.isArray(raw.data) ? raw.data : []).map((item) =>
    normalizeTaskRecord(item, hydrateAttachmentUrlsHelper),
  )
  const total = typeof raw.pagination?.total === 'number' ? raw.pagination.total : data.length
  const resolvedPageSize = typeof raw.pagination?.pageSize === 'number' ? raw.pagination.pageSize : pageSize
  const totalPages =
    typeof raw.pagination?.totalPages === 'number' && raw.pagination.totalPages > 0
      ? raw.pagination.totalPages
      : Math.max(1, Math.ceil(total / resolvedPageSize))

  return {
    data,
    pagination: {
      page: typeof raw.pagination?.page === 'number' ? raw.pagination.page : page,
      pageSize: resolvedPageSize,
      total,
      totalPages,
    },
  }
}

export async function getTaskDetail(id: string, signal?: AbortSignal): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
    method: 'GET',
    signal,
  })
  const payload = await parseResponse<{ data: unknown }>(response, '获取任务详情失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function createTaskDraft(input: TaskDraftInput): Promise<TaskRecord> {
  const response = await fetch(BASE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '创建任务草稿失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function updateTaskDraft(id: string, input: TaskPatchInput): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '保存任务修改失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function assignTask(
  id: string,
  input: { expectedRevision: number; dispatchId?: string | null },
): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      ...(input.dispatchId ? { dispatchId: input.dispatchId } : {}),
    }),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '任务派工失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function appendTaskProgress(
  id: string,
  input: {
    kind: TaskProgressKind
    note: string
    attachmentRefs?: Array<{ attachmentId: string; versionLabel?: string }>
    expectedRevision?: number
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  },
): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '登记任务进度失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function previewTaskRelease(
  id: string,
  input: { expectedRevision: number; recipient: TaskRecipient },
): Promise<TaskReleasePreviewResponse> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/release-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '生成发布资料预览失败')
  return normalizeReleasePreviewResponse(payload.data, hydrateAttachmentUrlsHelper)
}

export async function publishTaskRelease(
  id: string,
  input: {
    expectedRevision: number
    operationId: string
    recipient: TaskRecipient
    previewToken: string
  },
): Promise<TaskReleaseRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseResponse<{ data: Record<string, unknown> }>(response, '发布任务资料包失败')
  const raw = payload.data || {}
  return {
    id: String(raw.id || ''),
    taskId: String(raw.taskId || id),
    revision: Number(raw.revision || input.expectedRevision),
    operationId: String(raw.operationId || input.operationId),
    manifest: normalizeReleaseManifest(raw.manifest, hydrateAttachmentUrlsHelper),
    createdBy: String(raw.createdBy || ''),
    createdByName: typeof raw.createdByName === 'string' ? raw.createdByName : undefined,
    createdAt: String(raw.createdAt || ''),
    deliveries: Array.isArray(raw.deliveries) ? (raw.deliveries as TaskDeliveryRecord[]) : [],
  }
}

export async function downloadTaskReleaseManifest(
  id: string,
  releaseId: string,
): Promise<TaskReleaseManifest> {
  const response = await fetch(
    `${BASE_PATH}/${encodeURIComponent(id)}/releases/${encodeURIComponent(releaseId)}/manifest`,
    { method: 'GET' },
  )
  const raw = await parseResponse<unknown>(response, '读取发布资料清单失败')
  return normalizeReleaseManifest(raw, hydrateAttachmentUrlsHelper)
}

export async function recordTaskDelivery(
  id: string,
  releaseId: string,
  input: {
    operationId: string
    method: TaskDeliveryMethod
    status: TaskDeliveryStatus
    note?: string
  },
): Promise<TaskDeliveryRecord> {
  const response = await fetch(
    `${BASE_PATH}/${encodeURIComponent(id)}/releases/${encodeURIComponent(releaseId)}/deliveries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  const payload = await parseResponse<{ data: TaskDeliveryRecord }>(response, '登记资料发放记录失败')
  return payload.data
}

export async function archiveTask(id: string, expectedRevision: number): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '归档任务失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function restoreTask(id: string, expectedRevision: number): Promise<TaskRecord> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  })
  const payload = await parseResponse<{ data: unknown }>(response, '恢复归档任务失败')
  return normalizeTaskRecord(payload.data, hydrateAttachmentUrlsHelper)
}

export async function fetchTaskOptions(params: {
  type: TaskOptionType
  keyword?: string
  taskId?: string
  signal?: AbortSignal
}): Promise<TaskOptionItem[]> {
  const search = new URLSearchParams({ type: params.type })
  if (params.keyword?.trim()) search.set('keyword', params.keyword.trim())
  if (params.taskId) search.set('taskId', params.taskId)

  const response = await fetch(`${BASE_PATH}/options?${search.toString()}`, {
    method: 'GET',
    signal: params.signal,
  })
  const payload = await parseResponse<{ data: TaskOptionItem[] }>(response, '加载关联候选数据失败')
  return payload.data || []
}
