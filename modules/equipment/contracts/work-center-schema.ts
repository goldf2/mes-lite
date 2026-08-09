import { z } from 'zod'

export const workCenterFieldsSchema = z.object({
  code: z.string().trim().min(1, '工作中心编码必填').max(40, '工作中心编码不能超过 40 个字符'),
  name: z.string().trim().min(1, '工作中心名称必填').max(80, '工作中心名称不能超过 80 个字符'),
  category: z.string().trim().max(80, '类别不能超过 80 个字符').optional().nullable(),
  note: z.string().trim().max(500, '备注不能超过 500 个字符').optional().nullable(),
  isActive: z.boolean().optional(),
})

export const workCenterUpdateSchema = workCenterFieldsSchema.partial().extend({
  id: z.string().trim().min(1, '工作中心 ID 必填'),
})

export const workCenterIdSchema = z.string().trim().min(1, '缺少工作中心 ID')

export type WorkCenterInput = z.infer<typeof workCenterFieldsSchema>
export type WorkCenterUpdateInput = z.infer<typeof workCenterUpdateSchema>
