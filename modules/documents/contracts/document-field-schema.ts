import { z } from 'zod'

export const documentFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'])

export const documentFieldInputSchema = z.object({
  categoryId: z.string().trim().min(1, '请选择文档类别'),
  name: z.string().trim().min(1, '请输入字段名称').max(40, '字段名称不能超过 40 个字符'),
  fieldType: documentFieldTypeSchema,
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional().default([]),
})

export const documentFieldUpdateSchema = documentFieldInputSchema.extend({
  id: z.string().trim().min(1, '缺少字段 ID'),
})

export const documentFieldIdSchema = z.string().trim().min(1, '缺少字段 ID')
export const documentFieldCategoryIdSchema = z.string().trim().min(1, '缺少文档类别 ID')

export const documentFieldValuesSchema = z.record(
  z.string().trim().min(1, '扩展字段 ID 无效'),
  z.string().max(2000, '扩展字段值不能超过 2000 个字符'),
).default({})

export type DocumentFieldInput = z.infer<typeof documentFieldInputSchema>
export type DocumentFieldUpdateInput = z.infer<typeof documentFieldUpdateSchema>
export type DocumentFieldType = z.infer<typeof documentFieldTypeSchema>

export interface DocumentFieldDefinitionRecord {
  id: string
  categoryId: string
  name: string
  fieldType: DocumentFieldType
  optionsJson?: string | null
  sortOrder: number
  _count: { values: number }
  createdAt: string
  updatedAt: string
}

export interface WorkInstructionFieldValueRecord {
  id: string
  fieldDefinitionId: string
  valueText: string
  fieldDefinition: Pick<DocumentFieldDefinitionRecord, 'id' | 'name' | 'fieldType' | 'optionsJson' | 'sortOrder'>
}
