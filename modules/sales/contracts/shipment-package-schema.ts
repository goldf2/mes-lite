import { z } from 'zod'

const optionalPositiveNumber = z.number().finite().positive().optional()

export const createShipmentPackageSchema = z.object({
  quantity: z.number().finite().positive('装箱数量必须大于 0'),
  packedBy: z.string().trim().max(100).optional(),
  grossWeight: optionalPositiveNumber,
  netWeight: optionalPositiveNumber,
  weightUnit: z.string().trim().min(1).max(20).default('kg'),
  lengthMm: optionalPositiveNumber,
  widthMm: optionalPositiveNumber,
  heightMm: optionalPositiveNumber,
  sealNo: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.grossWeight !== undefined && value.netWeight !== undefined && value.netWeight > value.grossWeight) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['netWeight'], message: '净重不能大于毛重' })
  }
})

export type CreateShipmentPackageCommand = z.infer<typeof createShipmentPackageSchema>
