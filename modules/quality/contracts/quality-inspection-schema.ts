import { z } from 'zod'

export const decideQualityInspectionSchema = z.object({
  decision: z.enum(['PASS', 'FAIL', 'PARTIAL']),
  sampleQty: z.number().finite().positive('抽检数量必须大于 0'),
  goodQty: z.number().finite().min(0, '合格数量不能为负数'),
  badQty: z.number().finite().min(0, '不合格数量不能为负数'),
  releaseQty: z.number().finite().positive('放行数量必须大于 0').optional(),
  holdQty: z.number().finite().positive('冻结数量必须大于 0').optional(),
  note: z.string().trim().min(1, '请填写检验结论说明').max(500, '检验结论说明不能超过 500 字'),
}).superRefine((input, context) => {
  if (Math.abs(input.goodQty + input.badQty - input.sampleQty) > 0.000001) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '合格数量与不合格数量之和必须等于抽检数量', path: ['sampleQty'] })
  }
  if (input.decision === 'PASS' && input.badQty > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '整批合格时抽检不合格数量必须为 0', path: ['badQty'] })
  }
  if (input.decision === 'FAIL' && input.badQty <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '整批不合格时必须记录不合格样本', path: ['badQty'] })
  }
  if (input.decision === 'PARTIAL') {
    if (input.goodQty <= 0 || input.badQty <= 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '部分判定必须同时记录合格与不合格样本', path: ['decision'] })
    }
    if (input.releaseQty === undefined || input.holdQty === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '部分判定必须填写放行数量与冻结数量', path: ['releaseQty'] })
    }
  }
})

export type DecideQualityInspectionInput = z.infer<typeof decideQualityInspectionSchema>

export const qualityDispositionActions = [
  'REINSPECT',
  'CONCESSION',
  'REWORK_START',
  'REWORK_COMPLETE',
  'SCRAP',
  'UNFREEZE',
] as const

export const disposeQualityInspectionSchema = z.object({
  operationId: z.string().uuid('操作流水号格式不正确'),
  action: z.enum(qualityDispositionActions),
  stockQty: z.number().finite().positive('处置数量必须大于 0'),
  reason: z.string().trim().min(1, '请填写处置原因或审批依据').max(500, '处置说明不能超过 500 字'),
})

export type DisposeQualityInspectionInput = z.infer<typeof disposeQualityInspectionSchema>
