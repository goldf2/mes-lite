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
  employee?: { id: string; code: string; name: string; department?: string | null; isActive: boolean } | null
}

export interface PermissionScopeOption {
  id: string
  code: string
  name: string
}

export interface OperatorDataScopeSetting {
  operatorId: string
  productionMode: 'ALL' | 'SELF' | 'WORK_CENTERS'
  inventoryMode: 'ALL' | 'LOCATIONS'
  workCenterIds: string[]
  locationIds: string[]
  inheritedLegacyDefault?: boolean
}

export interface OperatorPermissionGroup {
  id?: string
  operatorId: string
  groupId: string
}

export interface OperatorPermissionOverrideSetting extends PermissionFlags {
  id: string
  operatorId: string
  resource: string
  reason?: string | null
  grantedBy?: string | null
  startsAt?: string | null
  expiresAt?: string | null
  legacyPermanent: boolean
}

export interface PermissionAdministrationData {
  resources: PermissionResourceItem[]
  actions: PermissionActionItem[]
  operators: PermissionOperator[]
  groups: PermissionGroup[]
  operatorGroups: OperatorPermissionGroup[]
  operatorPermissionOverrides: OperatorPermissionOverrideSetting[]
  operatorDataScopes: OperatorDataScopeSetting[]
  workCenters: PermissionScopeOption[]
  locations: PermissionScopeOption[]
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

const operatorDataScopeSchema = z.object({
  operatorId: z.string().min(1),
  productionMode: z.enum(['ALL', 'SELF', 'WORK_CENTERS']),
  inventoryMode: z.enum(['ALL', 'LOCATIONS']),
  workCenterIds: z.array(z.string()),
  locationIds: z.array(z.string()),
})

const operatorPermissionOverrideSchema = z.object({
  action: z.enum(['UPSERT', 'DELETE']),
  operatorId: z.string().min(1),
  resource: z.string().min(1),
  canRead: z.boolean().optional(),
  canCreate: z.boolean().optional(),
  canUpdate: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  canGrant: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
})

export const updatePermissionsSchema = z.object({
  groupId: z.string().optional(),
  groupSettings: z.array(groupSettingSchema).optional(),
  operatorGroups: z.array(operatorGroupSchema).optional(),
  operatorDataScopes: z.array(operatorDataScopeSchema).optional(),
  operatorPermissionOverrides: z.array(operatorPermissionOverrideSchema).optional(),
})

export const createPermissionGroupSchema = z.object({
  name: z.string().min(1, '权限组名称必填'),
  code: z.string().optional(),
  description: z.string().optional(),
})

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>
export type CreatePermissionGroupInput = z.infer<typeof createPermissionGroupSchema>
