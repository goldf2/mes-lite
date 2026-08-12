import { z } from 'zod'

export const decideQualityInspectionSchema = z.object({
  decision: z.enum(['PASS', 'FAIL']),
  sampleQty: z.number().finite().positive('抽检数量必须大于 0'),
  goodQty: z.number().finite().min(0, '合格数量不能为负数'),
  badQty: z.number().finite().min(0, '不合格数量不能为负数'),
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
})

export type DecideQualityInspectionInput = z.infer<typeof decideQualityInspectionSchema>
