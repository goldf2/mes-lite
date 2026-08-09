import { z } from 'zod'

export const productionCostRecordInputSchema = z.object({
  orderId: z.string().optional().nullable(),
  costType: z.enum(['MATERIAL', 'LABOR', 'EQUIPMENT', 'OVERHEAD', 'OTHER']),
  category: z.string().trim().min(1),
  amount: z.number().finite().nonnegative(),
  description: z.string().optional(),
  date: z.string().min(1),
  createdBy: z.string().optional(),
})

export type ProductionCostRecordInput = z.infer<typeof productionCostRecordInputSchema>
