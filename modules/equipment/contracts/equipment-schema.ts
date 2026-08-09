import { z } from 'zod'

export const equipmentStatusValues = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'STOPPED'] as const

export const equipmentInputSchema = z.object({
  code: z.string().trim().min(1, '设备编码必填').max(40, '设备编码不能超过 40 个字符'),
  name: z.string().trim().min(1, '设备名称必填').max(100, '设备名称不能超过 100 个字符'),
  equipmentType: z.string().trim().min(1, '设备类型必填').max(80, '设备类型不能超过 80 个字符'),
  workCenterId: z.string().trim().min(1, '请选择工作中心'),
  model: z.string().trim().max(100, '型号不能超过 100 个字符').optional().nullable(),
  manufacturer: z.string().trim().max(100, '制造商不能超过 100 个字符').optional().nullable(),
  serialNumber: z.string().trim().max(100, '出厂编号不能超过 100 个字符').optional().nullable(),
  status: z.enum(equipmentStatusValues).optional(),
  location: z.string().trim().max(100, '现场位置不能超过 100 个字符').optional().nullable(),
  basicParameters: z.string().trim().max(4000, '基础参数不能超过 4000 个字符').optional().nullable(),
  note: z.string().trim().max(1000, '备注不能超过 1000 个字符').optional().nullable(),
})

export const equipmentUpdateSchema = equipmentInputSchema.extend({
  id: z.string().trim().min(1, '设备 ID 必填'),
})

export const equipmentIdSchema = z.string().trim().min(1, '缺少设备 ID')

export type EquipmentInput = z.infer<typeof equipmentInputSchema>
