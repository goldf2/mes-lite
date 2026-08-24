import { z } from 'zod'

export const productionOrderLineSchema = z.object({
  targetId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1, '请选择 BOM 方案').optional(),
  planQty: z.number().finite().positive('计划数量必须大于 0'),
})

export const createProductionOrderSchema = z.object({
  voucherNo: z.string().optional(),
  targetType: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  targetId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  materialId: z.string().min(1).optional(),
  bomId: z.string().min(1).optional(),
  planQty: z.number().finite().positive().optional(),
  items: z.array(productionOrderLineSchema)
    .min(1, '请至少添加一个产品')
    .max(50, '单张生产订单最多添加 50 个产品')
    .optional(),
  note: z.string().optional(),
}).superRefine((value, context) => {
  if (value.items?.length) return
  if (!(value.targetId || value.materialId || value.productId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '请选择物料', path: ['targetId'] })
  }
  if (!value.planQty) context.addIssue({ code: z.ZodIssueCode.custom, message: '计划数量必须大于 0', path: ['planQty'] })
})

export const cancelProductionOrderSchema = z.object({
  reason: z.string().min(1, '取消原因必填'),
})

export type ProductionOrderLineInput = z.infer<typeof productionOrderLineSchema>
export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>
export type CancelProductionOrderInput = z.infer<typeof cancelProductionOrderSchema>
