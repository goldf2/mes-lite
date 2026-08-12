import { z } from 'zod'

export const legacyDailyProductionReportInputSchema = z.object({
  reportDate: z.string().trim().min(1, '生产日期必填'),
  finishedMaterialId: z.string().trim().min(1, '请选择产出物料'),
  bomId: z.string().trim().min(1, '请选择生产方案（BOM）'),
  consumptionLocationId: z.string().trim().min(1, '请选择原料出库库位').optional(),
  outputLocationId: z.string().trim().min(1, '请选择产出入库库位').optional(),
  outputQty: z.number().finite().positive('产出数量必须大于 0'),
  employeeIds: z.array(z.string().trim().min(1)).min(1, '请选择生产员工').max(50, '一次最多选择 50 名员工'),
  note: z.string().trim().optional(),
  consumptions: z.array(z.object({
    materialId: z.string().trim().min(1),
    locationId: z.string().trim().min(1, '请选择投入来源库位'),
    lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
    lossValue: z.number().finite().nonnegative(),
    actualQty: z.number().finite().positive().optional(),
  })).min(1, '请填写原料耗用').max(200),
}).refine((value) => new Set(value.consumptions.map((item) => item.materialId)).size === value.consumptions.length, {
  message: '同一原料不能重复填写',
})

export const confirmLegacyDailyProductionSchema = z.object({})

export const reverseLegacyDailyProductionSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
})

export type LegacyDailyProductionReportInput = z.infer<typeof legacyDailyProductionReportInputSchema>
export type ReverseLegacyDailyProductionInput = z.infer<typeof reverseLegacyDailyProductionSchema>
