import type {
  AttachmentItem,
  CustomerOption,
  DocumentCategoryRecord,
  MaterialOption,
  PaginationState,
  WorkCenterOption,
  WorkInstruction,
  WorkInstructionSaveInput,
} from '../contracts/work-instruction'

interface ApiEnvelope<T> {
  data?: T
  error?: string
  message?: string
  pagination?: PaginationState
}

export class DocumentApiError extends Error {}

async function readEnvelope<T>(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>
  if (!response.ok) throw new DocumentApiError(body.error || fallback)
  return body
}

export async function listDocumentCategories() {
  const response = await fetch('/api/document-categories')
  return (await readEnvelope<DocumentCategoryRecord[]>(response, '获取文档类别失败')).data || []
}

export async function listWorkInstructions(params: URLSearchParams) {
  const response = await fetch(`/api/work-instructions?${params.toString()}`)
  const body = await readEnvelope<WorkInstruction[]>(response, '获取产品文档失败')
  return { items: body.data || [], pagination: body.pagination }
}

export async function listDocumentCustomers() {
  const response = await fetch('/api/customers')
  return (await readEnvelope<CustomerOption[]>(response, '获取客户失败')).data || []
}

export async function listFinishedMaterialOptions(keyword = '') {
  const params = new URLSearchParams({ pageSize: '50', category: 'FINISHED' })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const response = await fetch(`/api/materials?${params.toString()}`)
  return (await readEnvelope<MaterialOption[]>(response, '获取产品失败')).data || []
}

export async function listInstructionAttachments(instructionId: string) {
  const response = await fetch(`/api/attachments?ownerType=WORK_INSTRUCTION&ownerId=${encodeURIComponent(instructionId)}`)
  return (await readEnvelope<AttachmentItem[]>(response, '获取附件失败')).data || []
}

export async function listDocumentWorkCenters() {
  const response = await fetch('/api/work-centers')
  return (await readEnvelope<WorkCenterOption[]>(response, '获取工作中心失败')).data || []
}

export async function uploadInstructionAttachment(instructionId: string, file: File) {
  const formData = new FormData()
  formData.append('ownerType', 'WORK_INSTRUCTION')
  formData.append('ownerId', instructionId)
  formData.append('documentType', 'WORK_INSTRUCTION')
  formData.append('file', file)
  const response = await fetch('/api/attachments', { method: 'POST', body: formData })
  return (await readEnvelope<AttachmentItem>(response, `上传 ${file.name} 失败`)).data!
}

export async function saveWorkInstruction(input: WorkInstructionSaveInput, id?: string) {
  const response = await fetch('/api/work-instructions', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { ...input, id } : input),
  })
  return (await readEnvelope<WorkInstruction>(response, '保存失败')).data!
}

export async function archiveWorkInstructionRecord(id: string) {
  const response = await fetch(`/api/work-instructions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return (await readEnvelope<never>(response, '归档失败')).message || '产品文档已归档'
}

export async function archiveInstructionAttachment(id: string) {
  const response = await fetch(`/api/attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  await readEnvelope<never>(response, '归档文件失败')
}

export async function setInstructionAttachmentRotation(id: string, rotation: number) {
  const response = await fetch('/api/attachments', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'SET_ROTATION', rotation }),
  })
  const body = await readEnvelope<AttachmentItem>(response, '保存文件方向失败')
  return { attachment: body.data!, message: body.message || '文件方向已保存' }
}
