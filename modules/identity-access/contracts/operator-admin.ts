import { z } from 'zod'

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
  status: z.enum(operatorStatuses).optional(),
  role: z.enum(operatorRoles).optional(),
})

export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>

export const deleteOperatorSchema = z.object({
  id: z.string().min(1),
})
