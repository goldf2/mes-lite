import { z } from 'zod'

export interface PermissionActor {
  id: string
  role: string
}

const groupSettingSchema = z.object({
  resource: z.string().min(1),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canGrant: z.boolean().optional(),
})

const operatorGroupSchema = z.object({
  operatorId: z.string().min(1),
  groupIds: z.array(z.string()),
})

export const updatePermissionsSchema = z.object({
  groupId: z.string().optional(),
  groupSettings: z.array(groupSettingSchema).optional(),
  operatorGroups: z.array(operatorGroupSchema).optional(),
})

export const createPermissionGroupSchema = z.object({
  name: z.string().min(1, '权限组名称必填'),
  code: z.string().optional(),
  description: z.string().optional(),
})

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>
export type CreatePermissionGroupInput = z.infer<typeof createPermissionGroupSchema>
