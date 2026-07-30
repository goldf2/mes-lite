import { z } from 'zod'

export const dailyProductionReportInputSchema = z.object({
  reportDate: z.string().min(1, '生产日期必填'),
  finishedMaterialId: z.string().min(1, '请选择产出物料'),
  goodQty: z.number().finite().nonnegative(),
  badQty: z.number().finite().nonnegative(),
  scrapQty: z.number().finite().nonnegative(),
  workers: z.string().trim().min(1, '生产人员必填'),
  note: z.string().trim().optional(),
  consumptions: z.array(z.object({
    materialId: z.string().min(1),
    actualQty: z.number().finite().nonnegative(),
  })).max(200).default([]),
}).refine((value) => value.goodQty + value.badQty + value.scrapQty > 0, {
  message: '合格、不良和报废数量不能全部为 0',
}).refine((value) => value.consumptions.some((item) => item.actualQty > 0), {
  message: '请至少填写一项实际原料耗用',
})

export function parseDailyProductionReportDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('生产日期格式不正确')
  return date
}

export const dailyProductionReportInclude = {
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
