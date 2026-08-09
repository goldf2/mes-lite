import { z } from 'zod'

export const createDispatchSchema = z.object({
  voucherNo: z.string().optional(),
  orderId: z.string().min(1, '工单必填'),
  stepId: z.string().min(1, '工序必填'),
  workerName: z.string().trim().min(1, '工人姓名必填'),
  workerId: z.string().optional(),
  planQty: z.number().int('计划数量必须为整数').positive('计划数量必须大于 0'),
  priority: z.string().optional(),
  note: z.string().optional(),
})

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>
