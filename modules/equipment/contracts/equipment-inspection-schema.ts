import { z } from 'zod'

export const inspectionItemInputSchema = z.object({
  name: z.string().trim().min(1, '点检项目名称必填').max(100),
  standard: z.string().trim().min(1, '点检标准必填').max(300),
  unit: z.string().trim().max(30).optional().nullable(),
})

export const equipmentInspectionPlanInputSchema = z.object({
  code: z.string().trim().min(1, '点检计划编码必填').max(40),
  name: z.string().trim().min(1, '点检计划名称必填').max(100),
  equipmentId: z.string().trim().min(1, '请选择设备'),
  intervalDays: z.coerce.number().int().min(1, '点检周期至少 1 天').max(3650),
  nextDueAt: z.coerce.date(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z.array(inspectionItemInputSchema).min(1, '至少添加一个点检项目').max(50),
}).strict()

export const equipmentInspectionPlanUpdateSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(['PAUSE', 'RESUME']),
}).strict()

export const inspectionResultInputSchema = z.object({
  planItemId: z.string().trim().min(1),
  actualValue: z.string().trim().max(300).optional().nullable(),
  result: z.enum(['PASS', 'FAIL']),
  note: z.string().trim().max(500).optional().nullable(),
})

export const completeEquipmentInspectionSchema = z.object({
  operationId: z.string().uuid('点检幂等标识无效'),
  inspectedAt: z.coerce.date(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z.array(inspectionResultInputSchema).min(1).max(50),
}).strict()

export type EquipmentInspectionPlanInput = z.infer<typeof equipmentInspectionPlanInputSchema>
export type CompleteEquipmentInspectionInput = z.infer<typeof completeEquipmentInspectionSchema>
