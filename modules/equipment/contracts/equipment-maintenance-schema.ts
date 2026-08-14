import { z } from 'zod'

const operationIdSchema = z.string().uuid('操作标识无效')
const nullableText = (max: number, message: string) => z.string().trim().max(max, message).optional().nullable()

export const equipmentMaintenancePlanInputSchema = z.object({
  code: z.string().trim().min(1, '请填写保养计划编码').max(50, '计划编码不能超过 50 个字符'),
  name: z.string().trim().min(1, '请填写保养计划名称').max(100, '计划名称不能超过 100 个字符'),
  equipmentId: z.string().trim().min(1, '请选择设备'),
  intervalDays: z.number().int().min(1, '保养周期至少 1 天').max(3650, '保养周期不能超过 3650 天'),
  nextDueAt: z.coerce.date(),
  note: nullableText(1000, '计划说明不能超过 1000 个字符'),
  items: z.array(z.object({
    name: z.string().trim().min(1, '请填写保养项目名称').max(100, '项目名称不能超过 100 个字符'),
    standard: z.string().trim().min(1, '请填写保养标准').max(500, '保养标准不能超过 500 个字符'),
  }).strict()).min(1, '至少添加一个保养项目').max(100, '保养项目不能超过 100 项'),
}).strict()

export const equipmentMaintenancePlanActionSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(['PAUSE', 'RESUME']),
}).strict()

export const createPreventiveMaintenanceWorkOrderSchema = z.object({
  operationId: operationIdSchema,
  assignedTo: nullableText(100, '负责人不能超过 100 个字符'),
}).strict()

export const createCorrectiveMaintenanceWorkOrderSchema = z.object({
  operationId: operationIdSchema,
  equipmentId: z.string().trim().min(1, '请选择设备'),
  title: z.string().trim().min(1, '请填写维修主题').max(100, '维修主题不能超过 100 个字符'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  faultDescription: z.string().trim().min(1, '请填写故障现象').max(1000, '故障现象不能超过 1000 个字符'),
  assignedTo: nullableText(100, '负责人不能超过 100 个字符'),
  dueAt: z.coerce.date().optional().nullable(),
}).strict()

export const completeEquipmentMaintenanceWorkOrderSchema = z.object({
  operationId: operationIdSchema,
  completedAt: z.coerce.date(),
  workDescription: z.string().trim().min(1, '请填写维修或保养内容').max(2000, '作业内容不能超过 2000 个字符'),
  failureCause: nullableText(1000, '故障原因不能超过 1000 个字符'),
  items: z.array(z.object({
    planItemId: z.string().trim().min(1),
    result: z.literal('PASS'),
    note: nullableText(500, '项目说明不能超过 500 个字符'),
  }).strict()).max(100),
  spares: z.array(z.object({
    materialId: z.string().trim().min(1, '请选择备件物料'),
    locationId: z.string().trim().min(1, '请选择备件库位'),
    stockQty: z.number().positive('备件数量必须大于 0').max(1_000_000, '备件数量过大'),
    note: nullableText(500, '备件说明不能超过 500 个字符'),
  }).strict()).max(100),
}).strict()

export const cancelEquipmentMaintenanceWorkOrderSchema = z.object({
  reason: z.string().trim().min(1, '请填写取消原因').max(500, '取消原因不能超过 500 个字符'),
}).strict()

export type EquipmentMaintenancePlanInput = z.infer<typeof equipmentMaintenancePlanInputSchema>
export type CreatePreventiveMaintenanceWorkOrderInput = z.infer<typeof createPreventiveMaintenanceWorkOrderSchema>
export type CreateCorrectiveMaintenanceWorkOrderInput = z.infer<typeof createCorrectiveMaintenanceWorkOrderSchema>
export type CompleteEquipmentMaintenanceWorkOrderInput = z.infer<typeof completeEquipmentMaintenanceWorkOrderSchema>
