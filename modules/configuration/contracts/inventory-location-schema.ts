import { z } from 'zod'

export const inventoryLocationFieldsSchema = z.object({
  code: z.string().trim().min(1, '库位编码必填').max(40, '库位编码不能超过 40 个字符'),
  name: z.string().trim().min(1, '库位名称必填').max(80, '库位名称不能超过 80 个字符'),
  note: z.string().trim().max(500, '备注不能超过 500 个字符').optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const inventoryLocationUpdateSchema = inventoryLocationFieldsSchema.partial().extend({
  id: z.string().trim().min(1, '库位 ID 必填'),
})

export const inventoryLocationIdSchema = z.string().trim().min(1, '缺少库位 ID')

export type InventoryLocationInput = z.infer<typeof inventoryLocationFieldsSchema>
export type InventoryLocationUpdateInput = z.infer<typeof inventoryLocationUpdateSchema>
