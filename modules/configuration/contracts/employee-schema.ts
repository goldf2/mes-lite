import { z } from 'zod'

export const employeeFieldsSchema = z.object({
  name: z.string().trim().min(1, '员工姓名必填').max(80, '员工姓名不能超过 80 个字符'),
  department: z.string().trim().max(80, '部门不能超过 80 个字符').optional().nullable(),
  phone: z.string().trim().max(40, '联系电话不能超过 40 个字符').optional().nullable(),
  note: z.string().trim().max(500, '备注不能超过 500 个字符').optional().nullable(),
  isActive: z.boolean().optional(),
  operatorId: z.string().trim().optional().nullable(),
})

export const employeeUpdateSchema = employeeFieldsSchema.extend({
  id: z.string().trim().min(1, '员工 ID 必填'),
})

export type EmployeeFieldsInput = z.infer<typeof employeeFieldsSchema>
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>
