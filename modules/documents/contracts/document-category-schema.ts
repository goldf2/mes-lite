import { z } from 'zod'

export const documentCategoryFieldsSchema = z.object({
  name: z.string().trim().min(1, '类别名称不能为空').max(40, '类别名称最多 40 个字符'),
  parentId: z.string().trim().min(1).nullable().optional(),
})

export const documentCategoryUpdateSchema = documentCategoryFieldsSchema.extend({
  id: z.string().trim().min(1, '缺少文档类别 ID'),
})

export const documentCategoryIdSchema = z.string().trim().min(1, '缺少文档类别 ID')

export type DocumentCategoryFieldsInput = z.infer<typeof documentCategoryFieldsSchema>
export type DocumentCategoryUpdateInput = z.infer<typeof documentCategoryUpdateSchema>
