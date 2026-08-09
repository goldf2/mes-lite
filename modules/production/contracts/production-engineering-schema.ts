import { z } from 'zod'

export const processCategories = ['SAWING', 'DRILLING', 'TURNING', 'MILLING', 'GRINDING', 'HEAT_TREATMENT', 'SURFACE_TREATMENT', 'ASSEMBLY', 'INSPECTION', 'OTHER'] as const

export const processTemplateInputSchema = z.object({
  code: z.string().min(1, '模板编码必填'),
  name: z.string().min(1, '工艺名称必填'),
  category: z.enum(processCategories),
  defaultTime: z.number().int().nonnegative().optional(),
  workstation: z.string().optional(),
  description: z.string().optional(),
  standardBatchQty: z.number().int().positive().default(1000),
  setupTimeMinutes: z.number().nonnegative().default(0),
  cycleTimeSeconds: z.number().nonnegative().default(0),
  peopleCount: z.number().nonnegative().default(1),
  laborRatePerHour: z.number().nonnegative().default(0),
  machineCount: z.number().nonnegative().default(1),
  machineRatePerHour: z.number().nonnegative().default(0),
  energyCostPerHour: z.number().nonnegative().default(0),
  consumableCostPerBatch: z.number().nonnegative().default(0),
  yieldRate: z.number().positive().max(1).default(1),
  materialIds: z.array(z.string()).default([]),
})

export const processStepInputSchema = z.object({
  stepNo: z.number().int().positive('工序号必须大于 0'),
  name: z.string().min(1, '工序名称必填'),
  defaultTime: z.number().int().nonnegative().optional(),
  workstation: z.string().optional(),
  description: z.string().optional(),
  templateId: z.string().optional(),
  templateCode: z.string().optional(),
  standardBatchQty: z.number().int().positive().default(1000),
  setupTimeMinutes: z.number().nonnegative().default(0),
  cycleTimeSeconds: z.number().nonnegative().default(0),
  peopleCount: z.number().nonnegative().default(1),
  laborRatePerHour: z.number().nonnegative().default(0),
  machineCount: z.number().nonnegative().default(1),
  machineRatePerHour: z.number().nonnegative().default(0),
  energyCostPerHour: z.number().nonnegative().default(0),
  consumableCostPerBatch: z.number().nonnegative().default(0),
  yieldRate: z.number().positive().max(1).default(1),
})

export const processRouteInputSchema = z.object({
  productId: z.string().min(1, '物料必填'),
  name: z.string().min(1, '工艺路线名称必填'),
  isDefault: z.boolean().optional(),
  steps: z.array(processStepInputSchema).min(1, '至少需要一个工序'),
})

export type ProcessTemplateInput = z.infer<typeof processTemplateInputSchema>
export type ProcessStepInput = z.infer<typeof processStepInputSchema>
export type ProcessRouteInput = z.infer<typeof processRouteInputSchema>
