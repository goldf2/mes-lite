import { MAX_ATTACHMENT_FILE_SIZE } from '@/lib/attachment-file-types'
import { EMPTY_DOCUMENT_JSON } from '@/lib/document-content'
import { documentCategoryLabel } from '../domain/document-category-rules'
import type { MaterialOption, WorkInstruction, WorkInstructionForm } from '../contracts/work-instruction'

export const instructionStatusOptions = [
  { value: 'ACTIVE', label: '启用' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ARCHIVED', label: '停用' },
]

export const fileTypeOptions = [
  { value: 'all', label: '全部文件' },
  { value: 'image', label: '图片' },
  { value: 'pdf', label: 'PDF' },
  { value: 'office', label: 'Office' },
] as const

export const statusLabels = Object.fromEntries(instructionStatusOptions.map((item) => [item.value, item.label]))

export function createEmptyWorkInstructionForm(): WorkInstructionForm {
  return {
    title: '',
    categoryId: '',
    version: 'v1',
    status: 'ACTIVE',
    materialId: '',
    contentJson: EMPTY_DOCUMENT_JSON,
    note: '',
    fieldValues: {},
  }
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatInstructionDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

export function isSupportedDocumentFile(file: File) {
  return file.size > 0 && file.size <= MAX_ATTACHMENT_FILE_SIZE
}

export function mergeSelectedFiles(current: File[], next: File[]) {
  const merged = new Map(current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]))
  next.forEach((file) => merged.set(`${file.name}:${file.size}:${file.lastModified}`, file))
  return Array.from(merged.values())
}

export function formatMaterialLabel(material: MaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

export function materialIncludesKeyword(material: MaterialOption, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return true
  return [material.code, material.name, material.spec || '', material.customer?.name || '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedKeyword)
}

export function getInstructionCustomerName(instruction: WorkInstruction) {
  return instruction.material?.customer?.name || '通用/未绑定'
}

export function getInstructionScopeLabel(instruction: WorkInstruction) {
  return instruction.material ? `${instruction.material.code} · ${instruction.material.name}` : '通用文档'
}

export function getInstructionCategoryLabel(instruction: WorkInstruction) {
  return documentCategoryLabel(instruction.category)
}
