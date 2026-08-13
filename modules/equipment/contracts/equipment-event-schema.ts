import { z } from 'zod'

export const equipmentEventActionValues = ['START', 'STOP', 'FAULT', 'RECOVER'] as const

export const equipmentEventCommandSchema = z.object({
  action: z.enum(equipmentEventActionValues),
  reason: z.string().trim().min(1, '请填写设备状态变化原因').max(200, '原因不能超过 200 个字符'),
  note: z.string().trim().max(1000, '补充说明不能超过 1000 个字符').optional().nullable(),
}).strict()

export type EquipmentEventCommand = z.infer<typeof equipmentEventCommandSchema>
export type EquipmentEventAction = typeof equipmentEventActionValues[number]
