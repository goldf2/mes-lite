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

const uniqueContextIds = (label: string) => z.array(z.string().min(1)).max(20, `${label}最多选择 20 项`).optional().refine(
  (ids) => !ids || new Set(ids).size === ids.length,
  `${label}不能重复选择`,
)

const contextExceptionReason = (label: string) => z.string().trim()
  .min(2, `${label}至少填写 2 个字符`)
  .max(200, `${label}不能超过 200 个字符`)
  .optional()

export const createProductionOrderActualSchema = z.object({
  actualDate: z.string().min(1, '生产日期必填'),
  employeeIds: z.array(z.string().min(1)).min(1, '请选择生产员工').max(50),
  equipmentIds: uniqueContextIds('实际设备'),
  equipmentExceptionReason: contextExceptionReason('设备例外原因'),
  workInstructionIds: uniqueContextIds('作业文件'),
  workInstructionExceptionReason: contextExceptionReason('作业文件例外原因'),
  note: z.string().trim().optional(),
  inputs: z.array(productionOrderActualInputSchema).min(1, '请填写投入实绩').max(200),
  outputs: z.array(productionOrderActualOutputSchema).min(1, '请填写产出实绩').max(50),
}).superRefine((input, context) => {
  if ((input.equipmentIds?.length || 0) === 0 && !input.equipmentExceptionReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['equipmentExceptionReason'], message: '请选择实际设备或填写设备例外原因' })
  }
  if ((input.workInstructionIds?.length || 0) === 0 && !input.workInstructionExceptionReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['workInstructionExceptionReason'], message: '请选择作业文件或填写作业文件例外原因' })
  }
})

export const confirmProductionOrderActualSchema = z.object({})

export const reverseProductionOrderActualSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
})

export type CreateProductionOrderActualInput = z.infer<typeof createProductionOrderActualSchema>
export type ConfirmProductionOrderActualInput = z.infer<typeof confirmProductionOrderActualSchema>
export type ReverseProductionOrderActualInput = z.infer<typeof reverseProductionOrderActualSchema>
