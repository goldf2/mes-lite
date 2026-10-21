import { z } from 'zod'

const positiveDimension = z.number().finite().positive().max(100000).optional()
export const createWarehousePackageSchema = z.object({
  clientRequestId: z.string().trim().min(1).max(100).optional(),
  inventoryLotId: z.string().min(1),
  locationId: z.string().min(1),
  quantity: z.number().finite().min(0.000001, '装箱数量至少为 0.000001').refine((value) => value === Number(value.toFixed(6)), '装箱数量最多保留 6 位小数'),
  packagingType: z.enum(['CARTON', 'METAL_CAGE', 'PLASTIC_BOX', 'OTHER']),
  packedBy: z.string().trim().min(1, '请填写包装人员').max(100),
  packedAt: z.string().datetime(),
  productionPersonnel: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  qualityPersonnel: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  lengthMm: positiveDimension, widthMm: positiveDimension, heightMm: positiveDimension,
  grossWeight: z.number().finite().nonnegative().optional(),
  netWeight: z.number().finite().nonnegative().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict().refine((value) => value.grossWeight == null || value.netWeight == null || value.netWeight <= value.grossWeight, { message: '净重不能大于毛重', path: ['netWeight'] })

export const voidWarehousePackageSchema = z.object({ reason: z.string().trim().min(2, '请填写作废原因').max(200) }).strict()
export type CreateWarehousePackageCommand = z.infer<typeof createWarehousePackageSchema>
