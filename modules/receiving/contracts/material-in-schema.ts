import { z } from 'zod'
import { materialInPriceUnits } from '@/lib/material-in-quantity'

export const materialInCommonShape = {
  voucherNo: z.string().optional(),
  supplierId: z.string().min(1, '供应商必填'),
  stagingLocationId: z.string().min(1, '待分库库位必填').optional(),
  receivedBy: z.string().optional(),
  note: z.string().optional(),
}

export const materialInItemShape = {
  materialId: z.string().min(1, '物料必填'),
  locationId: z.string().min(1, '库位必填').optional(),
  qty: z.number().positive('数量必须大于 0'),
  pieceCount: z.number().int().positive('数量必须为正整数').optional(),
  stockQtyMode: z.enum(['TOTAL', 'PER_PIECE']).optional(),
  stockQtyInput: z.number().positive('长度必须大于 0').optional(),
  totalLength: z.number().nonnegative('总长度不能为负').optional(),
  totalWeight: z.number().nonnegative('总重量不能为负').optional(),
  unit: z.string().optional(),
  valuationQty: z.number().nonnegative('核算数量不能为负').optional(),
  valuationUnit: z.string().optional(),
  unitPrice: z.number().nonnegative('单价不能为负'),
  totalAmount: z.number().nonnegative('总价格不能为负').optional(),
  priceBasis: z.enum(['VALUATION', 'STOCK']).optional(),
  priceUnit: z.enum(materialInPriceUnits).optional(),
  batchNo: z.string().optional(),
}

export const materialInItemSchema = z.object(materialInItemShape)

export const updateMaterialInSchema = z.object({
  ...materialInCommonShape,
  items: z.array(materialInItemSchema).min(1, '请至少添加一种物料').max(100, '单张来料单最多添加 100 种物料'),
})

export const reverseMaterialInSchema = z.object({
  reason: z.string().trim().min(1, '红冲原因必填'),
})

export const createMaterialInSchema = z.union([
  z.object({ ...materialInCommonShape, ...materialInItemShape }),
  z.object({
    ...materialInCommonShape,
    items: z.array(materialInItemSchema).min(1, '请至少添加一种物料').max(100, '单张来料单最多添加 100 种物料'),
  }),
])

export type CreateMaterialInInput = z.infer<typeof createMaterialInSchema>
export type MaterialInItemInput = z.infer<typeof materialInItemSchema>
export type UpdateMaterialInInput = z.infer<typeof updateMaterialInSchema>
export type ReverseMaterialInInput = z.infer<typeof reverseMaterialInSchema>
