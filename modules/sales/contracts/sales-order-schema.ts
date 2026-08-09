import { z } from 'zod'

export const salesOrderLineSchema = z.object({
  materialId: z.string().trim().min(1, '请选择物料'),
  qty: z.number().finite().positive('销售数量必须大于 0'),
  unitPrice: z.number().finite().nonnegative('单价不能小于 0').optional(),
  note: z.string().optional(),
})

export const createSalesOrderSchema = z.object({
  voucherNo: z.string().optional(),
  customerId: z.string().trim().min(1, '请选择客户'),
  orderDate: z.string().min(1, '请选择订单日期'),
  deliveryDate: z.string().optional(),
  note: z.string().optional(),
  items: z.array(salesOrderLineSchema).min(1, '请至少添加一个销售物料').max(50, '一张销售订单最多添加 50 项物料'),
})

export const updateSalesOrderPriceSchema = z.object({
  reason: z.string().trim().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    unitPrice: z.number().finite().nonnegative('单价不能小于 0'),
  })).min(1, '请至少提交一条销售明细'),
})

export type CreateSalesOrderCommand = z.infer<typeof createSalesOrderSchema>
export type UpdateSalesOrderPriceCommand = z.infer<typeof updateSalesOrderPriceSchema>
