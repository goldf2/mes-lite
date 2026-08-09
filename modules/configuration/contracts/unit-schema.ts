import { z } from 'zod'

export const unitMeasureTypes = ['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER'] as const

export const unitFieldsSchema = z.object({
  code: z.string().trim().min(1, '单位编码不能为空').max(20, '单位编码不能超过 20 个字符'),
  name: z.string().trim().min(1, '单位名称不能为空').max(30, '单位名称不能超过 30 个字符'),
  measureType: z.enum(unitMeasureTypes),
  toBaseFactor: z.number().finite().positive('换算系数必须大于 0'),
})

export const unitUpdateSchema = unitFieldsSchema.extend({
  originalCode: z.string().trim().min(1, '原单位编码不能为空'),
  originalMeasureType: z.enum(unitMeasureTypes),
})

export const unitIdentitySchema = z.object({
  code: z.string().trim().min(1, '单位编码不能为空'),
  measureType: z.enum(unitMeasureTypes),
})

export type UnitFieldsInput = z.infer<typeof unitFieldsSchema>
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>
export type UnitIdentityInput = z.infer<typeof unitIdentitySchema>
