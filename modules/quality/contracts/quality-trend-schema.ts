import { z } from 'zod'
import { qualityInspectionSourceTypes } from './quality-inspection-standard-schema'

export const qualityTrendQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  materialId: z.string().trim().min(1).optional(),
  sourceType: z.enum(qualityInspectionSourceTypes).optional(),
})

export type QualityTrendQuery = z.infer<typeof qualityTrendQuerySchema>
