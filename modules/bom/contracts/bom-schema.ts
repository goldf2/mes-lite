import { z } from 'zod'

const bomItemSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  outputMaterialId: z.string().min(1).nullable().optional(),
  quantity: z.number().finite().positive('批量用量必须大于 0'),
  unit: z.string().trim().optional(),
  entryUnit: z.string().trim().min(1).max(20).optional(),
  wastageRate: z.number().finite().nonnegative().optional().default(0),
})

const bomOutputSchema = z.object({
  materialId: z.string().min(1, '请选择产出物料'),
  quantity: z.number().finite().positive('基准产出数量必须大于 0'),
  entryUnit: z.string().trim().min(1).max(20).optional(),
  isPrimary: z.boolean().optional().default(false),
})

export const saveBomSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1).optional(),
  createNew: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(80).optional(),
  purpose: z.enum(['PRODUCTION', 'PACKAGING']).optional().default('PRODUCTION'),
  version: z.string().trim().min(1).max(30).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional().default(true),
  outputQuantity: z.number().finite().positive('基准产出数量必须大于 0').default(1),
  outputs: z.array(bomOutputSchema).min(1, '至少需要一项产出').max(50, 'BOM 产出过多').optional(),
  items: z.array(bomItemSchema).min(1, '至少需要一项投入').max(200, 'BOM 明细过多'),
})

export type SaveBomInput = z.infer<typeof saveBomSchema>
