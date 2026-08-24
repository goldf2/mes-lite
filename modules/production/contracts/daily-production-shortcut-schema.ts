import { z } from 'zod'

export const dailyProductionShortcutSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生产日期格式错误'),
  bomId: z.string().trim().min(1).optional(),
  outputDisposition: z.enum(['DIRECT_AVAILABLE', 'QUALITY_INSPECTION']).default('DIRECT_AVAILABLE'),
  note: z.string().trim().max(500).optional(),
  consumptions: z.array(z.object({
    materialId: z.string().trim().min(1),
    locationId: z.string().trim().min(1, '请选择投入来源库位'),
    lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
    lossValue: z.number().finite().nonnegative(),
    actualQty: z.number().finite().positive(),
  }).strict()).min(1, '请至少添加一项实际投入').max(200),
  outputs: z.array(z.object({
    materialId: z.string().trim().min(1),
    locationId: z.string().trim().min(1, '请选择产出入库库位'),
    actualQty: z.number().finite().positive('产出数量必须大于 0'),
    isPrimary: z.boolean(),
  }).strict()).min(1, '请至少添加一项实际产出').max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.consumptions.map((item) => item.materialId)).size !== value.consumptions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['consumptions'], message: '同一投入物料不能重复填写' })
  }
  if (new Set(value.outputs.map((item) => item.materialId)).size !== value.outputs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: '同一产出物料不能重复填写' })
  }
  if (value.outputs.filter((item) => item.isPrimary).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: '必须且只能指定一项主产出' })
  }
})

export type DailyProductionShortcutInput = z.infer<typeof dailyProductionShortcutSchema>
