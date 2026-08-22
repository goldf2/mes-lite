import type { DocumentFieldType } from '../contracts/document-field-schema'
import { DocumentFieldError } from './document-field-errors'

export const documentBaseFieldDefinitions = [
  { key: 'title', label: '文档标题', type: 'text' },
  { key: 'categoryId', label: '文档类别', type: 'select' },
  { key: 'status', label: '状态', type: 'select' },
  { key: 'version', label: '版本', type: 'text' },
  { key: 'material', label: '关联产品', type: 'text' },
  { key: 'note', label: '备注', type: 'text' },
  { key: 'contentText', label: '在线正文', type: 'text' },
  { key: 'attachmentName', label: '原始文件', type: 'text' },
] as const

export const documentBaseFields = documentBaseFieldDefinitions.map((field) => field.label)

export const documentFieldTypeOptions: { value: DocumentFieldType; label: string }[] = [
  { value: 'TEXT', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'DATE', label: '日期' },
  { value: 'BOOLEAN', label: '是/否' },
  { value: 'SELECT', label: '下拉选项' },
]

export function normalizeFieldName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeFieldOptions(fieldType: DocumentFieldType, values: string[]) {
  if (fieldType !== 'SELECT') return []
  const options = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
  if (options.length === 0) throw new DocumentFieldError('下拉字段至少需要一个选项')
  return options
}

export function parseFieldOptions(optionsJson: string | null | undefined) {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function normalizeDocumentFieldValue(
  definition: { name: string; fieldType: string; optionsJson?: string | null },
  rawValue: string,
) {
  const value = rawValue.trim()
  if (!value) return ''
  if (definition.fieldType === 'NUMBER' && !Number.isFinite(Number(value))) {
    throw new DocumentFieldError(`字段「${definition.name}」必须填写数字`)
  }
  if (definition.fieldType === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DocumentFieldError(`字段「${definition.name}」必须填写有效日期`)
  }
  if (definition.fieldType === 'BOOLEAN' && value !== 'true' && value !== 'false') {
    throw new DocumentFieldError(`字段「${definition.name}」必须选择是或否`)
  }
  if (definition.fieldType === 'SELECT' && !parseFieldOptions(definition.optionsJson).includes(value)) {
    throw new DocumentFieldError(`字段「${definition.name}」的选项无效`)
  }
  if (value.length > 2000) throw new DocumentFieldError(`字段「${definition.name}」不能超过 2000 个字符`)
  return value
}
