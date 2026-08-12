export type AttachmentApiEnvelope<T> = {
  data?: T
  error?: string
  message?: string
  count?: number
}

export class AttachmentApiError extends Error {}

async function readAttachmentEnvelope<T>(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as AttachmentApiEnvelope<T>
  if (!response.ok) throw new AttachmentApiError(body.error || fallback)
  return body
}

export async function listAttachments<T>(ownerType: string, ownerId: string) {
  const params = new URLSearchParams({ ownerType, ownerId })
  const response = await fetch(`/api/attachments?${params}`)
  return (await readAttachmentEnvelope<T[]>(response, '获取附件失败')).data || []
}

export async function uploadAttachment<T>(input: {
  ownerType: string
  ownerId: string
  documentType?: string
  note?: string
  file: File
}) {
  const form = new FormData()
  form.append('ownerType', input.ownerType)
  form.append('ownerId', input.ownerId)
  form.append('documentType', input.documentType || 'ORIGINAL')
  if (input.note?.trim()) form.append('note', input.note.trim())
  form.append('file', input.file)
  const response = await fetch('/api/attachments', { method: 'POST', body: form })
  const body = await readAttachmentEnvelope<T>(response, `上传 ${input.file.name} 失败`)
  if (!body.data) throw new AttachmentApiError('附件上传结果为空')
  return body.data
}

export async function archiveAttachment(id: string) {
  const response = await fetch(`/api/attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return (await readAttachmentEnvelope<never>(response, '归档附件失败')).message || '附件已归档'
}

export async function setAttachmentCover(id: string) {
  const response = await fetch('/api/attachments', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'SET_COVER' }),
  })
  return (await readAttachmentEnvelope<never>(response, '设置封面失败')).message || '封面已更新'
}

export async function setAttachmentRotation<T>(id: string, rotation: number) {
  const response = await fetch('/api/attachments', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'SET_ROTATION', rotation }),
  })
  const body = await readAttachmentEnvelope<T>(response, '保存文件方向失败')
  if (!body.data) throw new AttachmentApiError('附件方向更新结果为空')
  return { attachment: body.data, message: body.message || '文件方向已保存' }
}

export async function finalizeDraftAttachments(input: { ownerType: string; draftOwnerId: string; targetOwnerId: string }) {
  const response = await fetch('/api/attachments/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readAttachmentEnvelope<never>(response, '暂存附件绑定失败')
  return Number(body.count || 0)
}

export async function discardDraftAttachments(ownerType: string, draftOwnerId: string) {
  const params = new URLSearchParams({ ownerType, draftOwnerId })
  const response = await fetch(`/api/attachments/drafts?${params}`, { method: 'DELETE' })
  const body = await readAttachmentEnvelope<never>(response, '暂存附件清理失败')
  return Number(body.count || 0)
}
