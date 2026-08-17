import { z } from 'zod'
import { operatorNameSchema, operatorPasswordSchema, operatorPhoneSchema, operatorUsernameSchema } from './authentication'

export const operatorRoles = ['OPERATOR', 'AUDITOR', 'ADMIN'] as const
export const operatorStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'DISABLED'] as const

export type OperatorRole = (typeof operatorRoles)[number]
export type OperatorStatus = (typeof operatorStatuses)[number]

export interface OperatorAdminItem {
  id: string
  username: string
  name: string
  phone?: string | null
  role: OperatorRole
  status: OperatorStatus
  approvedAt?: string | Date | null
  approvedBy?: string | null
  lastLoginAt?: string | Date | null
  createdAt: string | Date
  updatedAt?: string | Date
}

export const updateOperatorSchema = z.object({
  id: z.string().min(1),
  username: operatorUsernameSchema.optional(),
  name: operatorNameSchema.optional(),
  phone: operatorPhoneSchema.optional(),
  status: z.enum(operatorStatuses).optional(),
  role: z.enum(operatorRoles).optional(),
})

export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>

export const deleteOperatorSchema = z.object({
  id: z.string().min(1),
})

export const resetOperatorPasswordSchema = z.object({
  id: z.string().min(1),
  password: operatorPasswordSchema,
  confirmPassword: z.string(),
}).refine((input) => input.password === input.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
})

export type ResetOperatorPasswordInput = z.infer<typeof resetOperatorPasswordSchema>
