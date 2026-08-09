import { z } from 'zod'

export const legacyProductionOrderPickSchema = z.object({
  items: z.array(z.object({
    pickItemId: z.string().min(1, '请选择领料项'),
    actualQty: z.number().positive('实际领料数量必须大于 0'),
    pickedBy: z.string().trim().min(1, '请填写领料人'),
  })).min(1, '请至少提交一项领料明细'),
})

export const legacyProductionOrderReportSchema = z.object({
  stepId: z.string().min(1, '请选择工序'),
  workerName: z.string().trim().min(1, '请填写操作人员'),
  workerId: z.string().optional(),
  goodQty: z.number().int().min(0),
  badQty: z.number().int().min(0),
  badReason: z.string().optional(),
  remark: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
})

export const legacyProductionOrderStockInSchema = z.object({
  qty: z.number().int().positive('入库数量必须大于 0'),
  batchNo: z.string().optional(),
  inBy: z.string().trim().min(1, '请填写入库人'),
  note: z.string().optional(),
})

export type LegacyProductionOrderPickInput = z.infer<typeof legacyProductionOrderPickSchema>
export type LegacyProductionOrderReportInput = z.infer<typeof legacyProductionOrderReportSchema>
export type LegacyProductionOrderStockInInput = z.infer<typeof legacyProductionOrderStockInSchema>
