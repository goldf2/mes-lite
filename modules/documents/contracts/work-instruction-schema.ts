import { z } from 'zod'
import { parseCsvFilter } from '@/lib/status-filter'

export const workInstructionAdvancedFieldSchema = z.enum([
  'title', 'categoryId', 'status', 'version', 'materialCode', 'materialName', 'materialSpec',
  'customerCode', 'customerName', 'workCenter', 'contentText', 'note', 'attachmentName',
  'fileType', 'createdAt', 'updatedAt',
])

export const workInstructionAdvancedConditionSchema = z.object({
  field: workInstructionAdvancedFieldSchema,
  operator: z.enum(['equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']),
  value: z.string().trim().min(1).max(200),
})

export const workInstructionInputSchema = z.object({
  title: z.string().trim().max(200, '文档标题不能超过 200 个字符').optional().default(''),
  materialId: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1, '请选择文档类别'),
  version: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  workCenterIds: z.array(z.string()).default([]),
  contentJson: z.string().optional().nullable(),
  note: z.string().optional(),
})

export const workInstructionUpdateInputSchema = workInstructionInputSchema.extend({ id: z.string().min(1, '缺少产品文档 ID') })

export type WorkInstructionAdvancedCondition = z.infer<typeof workInstructionAdvancedConditionSchema>
export type WorkInstructionInput = z.infer<typeof workInstructionInputSchema>
export type WorkInstructionUpdateInput = z.infer<typeof workInstructionUpdateInputSchema>

export interface WorkInstructionListQuery {
  keyword: string
  categoryIds: string[]
  statuses: string[]
  customerId: string | null
  materialId: string | null
  fileType: string | null
  advancedConditions: WorkInstructionAdvancedCondition[]
  page: number
  pageSize: number
}

export function parseWorkInstructionListQuery(searchParams: URLSearchParams): { data?: WorkInstructionListQuery; error?: string } {
  let advancedConditions: WorkInstructionAdvancedCondition[] = []
  const advanced = searchParams.get('advanced')
  if (advanced) {
    try {
      const result = z.array(workInstructionAdvancedConditionSchema).max(30).safeParse(JSON.parse(advanced))
      if (!result.success) return { error: '高级搜索条件无效' }
      advancedConditions = result.data
    } catch {
      return { error: '高级搜索条件格式错误' }
    }
  }
  const rawPage = Number(searchParams.get('page') || '1')
  const rawPageSize = Number(searchParams.get('pageSize') || '20')
  return {
    data: {
      keyword: searchParams.get('keyword')?.trim() || '',
      categoryIds: parseCsvFilter(searchParams.get('categoryIds')),
      statuses: parseCsvFilter(searchParams.get('statuses')),
      customerId: searchParams.get('customerId'),
      materialId: searchParams.get('materialId'),
      fileType: searchParams.get('fileType'),
      advancedConditions,
      page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
      pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20,
    },
  }
}
