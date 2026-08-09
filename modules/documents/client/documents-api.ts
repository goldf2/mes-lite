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
import type { DocumentCategoryFieldsInput } from '../contracts/document-category-schema'
import {
  archiveAttachment,
  listAttachments,
  setAttachmentRotation,
  uploadAttachment,
} from '@/modules/attachments'

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

export async function saveDocumentCategory(input: DocumentCategoryFieldsInput, id?: string) {
  const response = await fetch('/api/document-categories', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { ...input, id } : input),
  })
  return (await readEnvelope<DocumentCategoryRecord>(response, '保存文档类别失败')).data!
}

export async function removeDocumentCategory(id: string) {
  const response = await fetch(`/api/document-categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return (await readEnvelope<never>(response, '删除文档类别失败')).message || '文档类别已删除'
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
  return listAttachments<AttachmentItem>('WORK_INSTRUCTION', instructionId)
}

export async function listDocumentWorkCenters() {
  const response = await fetch('/api/work-centers')
  return (await readEnvelope<WorkCenterOption[]>(response, '获取工作中心失败')).data || []
}

export async function uploadInstructionAttachment(instructionId: string, file: File) {
  return uploadAttachment<AttachmentItem>({
    ownerType: 'WORK_INSTRUCTION',
    ownerId: instructionId,
    documentType: 'WORK_INSTRUCTION',
    file,
  })
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
  await archiveAttachment(id)
}

export async function setInstructionAttachmentRotation(id: string, rotation: number) {
  return setAttachmentRotation<AttachmentItem>(id, rotation)
}
