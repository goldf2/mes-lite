import { z } from 'zod'

export const createShipmentSchema = z.object({
  salesOrderItemId: z.string().optional(),
  materialId: z.string().optional(),
  customerId: z.string().optional(),
  voucherNo: z.string().optional(),
  unitPrice: z.number().finite().nonnegative().optional(),
  locationId: z.string().min(1, '发货库位必填').optional(),
  qty: z.number().finite().positive(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  shippedBy: z.string().optional(),
}).superRefine((data, context) => {
  if (data.salesOrderItemId) return
  if (!data.materialId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['materialId'], message: '请选择发货物料' })
  if (!data.customerId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerId'], message: '请选择客户' })
})

export const createReturnSchema = z.object({
  voucherNo: z.string().optional(),
  shipmentId: z.string().min(1).optional(),
  productId: z.string().min(1),
  locationId: z.string().min(1, '退回库位必填'),
  qty: z.number().finite().positive(),
  reason: z.string().trim().min(1, '退货原因必填'),
  note: z.string().optional(),
})

export const processReturnSchema = z.object({ processedBy: z.string().trim().optional() })

export type CreateShipmentCommand = z.infer<typeof createShipmentSchema>
export type CreateReturnCommand = z.infer<typeof createReturnSchema>
