import { AttachmentApiError, type AttachmentApiEnvelope } from './attachment-api'

export type OfficeViewSession = {
  id: string
  formActionUrl: string
  accessToken: string
  accessTokenTtl: number
  expiresAt: string
}

export class OfficeViewApiError extends AttachmentApiError {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function createOfficeViewSession(attachmentId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/office-view-session`, {
    method: 'POST',
    signal,
  })
  const body = await response.json().catch(() => ({})) as AttachmentApiEnvelope<OfficeViewSession>
  if (!response.ok || !body.data) {
    throw new OfficeViewApiError(body.error || '在线表格查看服务暂不可用', response.status)
  }
  return body.data
}

export async function revokeOfficeViewSession(attachmentId: string, sessionId: string) {
  const params = new URLSearchParams({ sessionId })
  await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/office-view-session?${params}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => undefined)
}
