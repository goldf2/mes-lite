import { z } from 'zod'

export interface PermissionActor {
  id: string
  role: string
}

export interface PermissionResourceItem {
  key: string
  label: string
  section: string
}

export interface PermissionFlags {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canGrant: boolean
}

export interface PermissionActionItem {
  key: keyof PermissionFlags
  label: string
}

export interface PermissionGroupSetting extends PermissionFlags {
  id?: string
  groupId: string
  resource: string
}

export interface PermissionGroup {
  id: string
  code: string
  name: string
  description?: string | null
  isSystem: boolean
  settings: PermissionGroupSetting[]
}

export interface PermissionOperator {
  id: string
  username: string
  name: string
  role: 'OPERATOR' | 'AUDITOR' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
}

export interface OperatorPermissionGroup {
  id?: string
  operatorId: string
  groupId: string
}

export interface PermissionAdministrationData {
  resources: PermissionResourceItem[]
  actions: PermissionActionItem[]
  operators: PermissionOperator[]
  groups: PermissionGroup[]
  operatorGroups: OperatorPermissionGroup[]
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
