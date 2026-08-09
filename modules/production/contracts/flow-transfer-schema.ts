import { z } from 'zod'

export const flowTransferInputSchema = z.object({
  transferDate: z.string().min(1, '转移日期必填'),
  materialId: z.string().min(1, '请选择物料'),
  sourceLocationId: z.string().min(1, '请选择来源库位'),
  targetLocationId: z.string().min(1, '请选择目标库位'),
  quantity: z.number().finite().positive('转移数量必须大于 0'),
  employeeId: z.string().min(1, '请选择操作员工'),
  note: z.string().trim().max(500, '备注不能超过 500 个字').optional(),
}).refine((value) => value.sourceLocationId !== value.targetLocationId, {
  message: '来源库位和目标库位不能相同',
  path: ['targetLocationId'],
})

export const confirmFlowTransferSchema = z.object({ confirmedBy: z.string().trim().optional() })

export const reverseFlowTransferSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
  reversedBy: z.string().trim().optional(),
})

export type FlowTransferInput = z.infer<typeof flowTransferInputSchema>
export type ReverseFlowTransferInput = z.infer<typeof reverseFlowTransferSchema>
