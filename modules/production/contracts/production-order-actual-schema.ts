import { z } from 'zod'

export const productionOrderActualInputSchema = z.object({
  materialId: z.string().min(1),
  locationId: z.string().min(1, '请选择投入来源库位'),
  lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
  lossValue: z.number().finite().nonnegative(),
  actualQty: z.number().finite().positive().optional(),
})

export const productionOrderActualOutputSchema = z.object({
  materialId: z.string().min(1),
  locationId: z.string().min(1, '请选择产出入库库位'),
  actualQty: z.number().finite().nonnegative(),
})

export const createProductionOrderActualSchema = z.object({
  actualDate: z.string().min(1, '生产日期必填'),
  employeeIds: z.array(z.string().min(1)).min(1, '请选择生产员工').max(50),
  note: z.string().trim().optional(),
  inputs: z.array(productionOrderActualInputSchema).min(1, '请填写投入实绩').max(200),
  outputs: z.array(productionOrderActualOutputSchema).min(1, '请填写产出实绩').max(50),
})

export const confirmProductionOrderActualSchema = z.object({})

export const reverseProductionOrderActualSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
})

export type CreateProductionOrderActualInput = z.infer<typeof createProductionOrderActualSchema>
export type ConfirmProductionOrderActualInput = z.infer<typeof confirmProductionOrderActualSchema>
export type ReverseProductionOrderActualInput = z.infer<typeof reverseProductionOrderActualSchema>
