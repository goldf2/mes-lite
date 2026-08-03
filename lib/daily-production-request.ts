import { z } from 'zod'

export const dailyProductionReportInputSchema = z.object({
  reportDate: z.string().min(1, '生产日期必填'),
  finishedMaterialId: z.string().min(1, '请选择产出物料'),
  bomId: z.string().min(1, '请选择 BOM 方案'),
  consumptionLocationId: z.string().min(1, '请选择原料出库库位').optional(),
  outputLocationId: z.string().min(1, '请选择产出入库库位').optional(),
  outputQty: z.number().finite().positive('产出数量必须大于 0'),
  workers: z.string().trim().min(1, '生产人员必填'),
  note: z.string().trim().optional(),
  consumptions: z.array(z.object({
    materialId: z.string().min(1),
    locationId: z.string().min(1, '请选择投入来源库位'),
    lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
    lossValue: z.number().finite().nonnegative(),
    actualQty: z.number().finite().positive().optional(),
  })).min(1, '请填写原料耗用').max(200),
}).refine((value) => new Set(value.consumptions.map((item) => item.materialId)).size === value.consumptions.length, {
  message: '同一原料不能重复填写',
})

export function parseDailyProductionReportDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('生产日期格式不正确')
  return date
}

export const dailyProductionReportInclude = {
  consumptionLocation: { select: { id: true, code: true, name: true } },
  outputLocation: { select: { id: true, code: true, name: true } },
  finishedMaterial: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      primaryMeasure: true,
      stockUnit: true,
      unit: true,
    },
  },
  consumptions: {
    include: {
      location: { select: { id: true, code: true, name: true } },
      material: {
        select: {
          id: true,
          code: true,
          name: true,
          primaryMeasure: true,
          stockUnit: true,
          unit: true,
          stock: { select: { qty: true, availableQty: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const
