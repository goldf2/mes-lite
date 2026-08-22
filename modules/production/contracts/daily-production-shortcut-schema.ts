import { z } from 'zod'

export const dailyProductionShortcutSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生产日期格式错误'),
  finishedMaterialId: z.string().trim().min(1, '请选择主产出物料'),
  bomId: z.string().trim().min(1, '请选择正式 BOM'),
  consumptionLocationId: z.string().trim().min(1, '请选择投入来源库位'),
  outputLocationId: z.string().trim().min(1, '请选择产出入库库位'),
  outputQty: z.number().finite().positive('主产出数量必须大于 0'),
  note: z.string().trim().max(500).optional(),
  consumptions: z.array(z.object({
    materialId: z.string().trim().min(1),
    locationId: z.string().trim().min(1, '请选择投入来源库位'),
    lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
    lossValue: z.number().finite().nonnegative(),
    actualQty: z.number().finite().positive(),
  }).strict()).min(1, '正式 BOM 至少需要一项投入').max(200),
}).strict().refine(
  (value) => new Set(value.consumptions.map((item) => item.materialId)).size === value.consumptions.length,
  { message: '同一投入物料不能重复填写' },
).refine(
  (value) => value.consumptions.every((item) => item.locationId === value.consumptionLocationId),
  { message: '快捷生产日报的全部投入必须使用所选来源库位' },
)

export type DailyProductionShortcutInput = z.infer<typeof dailyProductionShortcutSchema>
