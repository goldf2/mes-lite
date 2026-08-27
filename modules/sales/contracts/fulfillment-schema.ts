import { z } from 'zod'

const createShipmentItemSchema = z.object({
  materialId: z.string().min(1, '请选择发货物料'),
  unitPrice: z.number().finite().nonnegative().optional(),
  locationId: z.string().min(1, '发货库位必填'),
  qty: z.number().finite().positive(),
}).strict()

export const createShipmentSchema = z.object({
  customerId: z.string().min(1, '请选择客户'),
  voucherNo: z.string().optional(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  shippedBy: z.string().optional(),
  items: z.array(createShipmentItemSchema).min(1, '至少添加一项发货明细').max(100, '单张发货单最多 100 项'),
}).strict()

export const createReturnSchema = z.object({
  voucherNo: z.string().optional(),
  shipmentId: z.string().min(1, '请选择原发货单'),
  shipmentItemId: z.string().min(1, '请选择原发货明细'),
  locationId: z.string().min(1, '退回库位必填'),
  qty: z.number().finite().positive(),
  reason: z.string().trim().min(1, '退货原因必填'),
  note: z.string().optional(),
}).strict()

export const processReturnSchema = z.object({})

export const shipmentCancelSchema = z.object({
  reason: z.string().trim().min(2, '取消原因至少 2 个字').max(200, '取消原因不能超过 200 个字'),
})

export const shipmentReverseSchema = z.object({
  reason: z.string().trim().min(2, '冲销原因至少 2 个字').max(200, '冲销原因不能超过 200 个字'),
})

export const returnRejectSchema = z.object({
  reason: z.string().trim().min(2, '拒绝原因至少 2 个字').max(200, '拒绝原因不能超过 200 个字'),
})

export type CreateShipmentCommand = z.infer<typeof createShipmentSchema>
export type CreateReturnCommand = z.infer<typeof createReturnSchema>
