import { z } from 'zod'

export const shipmentPricesSchema = z.object({
  updatedAt: z.string().datetime(),
  reason: z.string().trim().min(2, '请填写补价或改价原因').max(200),
  items: z.array(z.object({ id: z.string().min(1), unitPrice: z.number().finite().nonnegative() }).strict()).min(1).max(100),
}).strict()
export type ShipmentPricesCommand = z.infer<typeof shipmentPricesSchema>

const createShipmentItemSchema = z.object({
  materialId: z.string().min(1, '请选择发货物料'),
  unitPrice: z.number().finite().nonnegative().optional(),
  locationId: z.string().min(1, '发货库位必填'),
  qty: z.number().finite().positive(),
}).strict()

const shipmentContentSchema = z.object({
  customerId: z.string().min(1, '请选择客户'),
  voucherNo: z.string().optional(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  shippedBy: z.string().optional(),
  items: z.array(createShipmentItemSchema).max(100, '单张发货单最多 100 项').default([]),
  packageIds: z.array(z.string().min(1)).max(100, '单张发货单最多选择 100 箱').optional(),
}).strict()

function validateShipmentContent(value: z.infer<typeof shipmentContentSchema>, context: z.RefinementCtx) {
  if (value.items.length === 0 && !value.packageIds?.length) context.addIssue({ code: z.ZodIssueCode.custom, message: '至少添加一项散货或选择一箱货物', path: ['items'] })
  if (new Set(value.packageIds).size !== (value.packageIds?.length || 0)) context.addIssue({ code: z.ZodIssueCode.custom, message: '同一货箱不能重复添加', path: ['packageIds'] })
}

export const createShipmentSchema = shipmentContentSchema.superRefine(validateShipmentContent)
export const updateShipmentDraftSchema = shipmentContentSchema.extend({
  mode: z.literal('draft'),
  updatedAt: z.string().datetime(),
}).strict().superRefine(validateShipmentContent)
export type UpdateShipmentDraftCommand = z.infer<typeof updateShipmentDraftSchema>

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
