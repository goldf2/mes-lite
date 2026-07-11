import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { getCurrentOperator } from './auth'

export const permissionRoles = [
  { key: 'OPERATOR', label: '录入' },
  { key: 'AUDITOR', label: '审核' },
  { key: 'ADMIN', label: '管理' },
] as const

export const permissionActions = [
  { key: 'canRead', label: '查' },
  { key: 'canCreate', label: '增' },
  { key: 'canUpdate', label: '改' },
  { key: 'canDelete', label: '删' },
] as const

export const permissionResources = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'orders', label: '工单管理' },
  { key: 'materials', label: '物料管理' },
  { key: 'materialIn', label: '来料管理' },
  { key: 'dispatch', label: '派工管理' },
  { key: 'stocks', label: '库存管理' },
  { key: 'shipment', label: '发货管理' },
  { key: 'return', label: '退货管理' },
  { key: 'stats', label: '统计分析' },
  { key: 'operators', label: '人员管理' },
  { key: 'system', label: '系统管理' },
  { key: 'permissions', label: '权限管理' },
  { key: 'attachments', label: '原始单据附件' },
] as const

export type PermissionRole = (typeof permissionRoles)[number]['key']
export type PermissionResource = (typeof permissionResources)[number]['key']
export type PermissionAction = 'read' | 'create' | 'update' | 'delete'

export type PermissionFlags = {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export type PermissionMap = Record<string, PermissionFlags>

const allOn: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: true }
const readOnly: PermissionFlags = { canRead: true, canCreate: false, canUpdate: false, canDelete: false }
const readCreate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: false, canDelete: false }
const readCreateUpdate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: false }
const none: PermissionFlags = { canRead: false, canCreate: false, canUpdate: false, canDelete: false }

const operatorDefaults: PermissionMap = {
  dashboard: readOnly,
  orders: readCreate,
  materials: readOnly,
  materialIn: readCreate,
  dispatch: readCreate,
  stocks: readOnly,
  shipment: readCreate,
  return: readCreate,
  stats: readOnly,
  operators: none,
  system: none,
  permissions: none,
  attachments: readCreate,
}

const auditorDefaults: PermissionMap = {
  dashboard: readOnly,
  orders: readCreateUpdate,
  materials: readOnly,
  materialIn: readCreateUpdate,
  dispatch: readCreateUpdate,
  stocks: { canRead: true, canCreate: false, canUpdate: true, canDelete: false },
  shipment: readCreateUpdate,
  return: readCreateUpdate,
  stats: readOnly,
  operators: { canRead: true, canCreate: false, canUpdate: true, canDelete: false },
  system: none,
  permissions: none,
  attachments: readCreate,
}

export const defaultPermissionMap: Record<PermissionRole, PermissionMap> = {
  OPERATOR: operatorDefaults,
  AUDITOR: auditorDefaults,
  ADMIN: Object.fromEntries(permissionResources.map((resource) => [resource.key, allOn])),
}

const actionField: Record<PermissionAction, keyof PermissionFlags> = {
  read: 'canRead',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
}

function cloneFlags(flags: PermissionFlags): PermissionFlags {
  return { ...flags }
}

export function defaultFlagsFor(role: string, resource: string): PermissionFlags {
  const typedRole = permissionRoles.some((item) => item.key === role) ? (role as PermissionRole) : 'OPERATOR'
  return cloneFlags(defaultPermissionMap[typedRole][resource] || none)
}

export async function ensureDefaultPermissions() {
  for (const role of permissionRoles) {
    for (const resource of permissionResources) {
      await prisma.permissionSetting.upsert({
        where: { role_resource: { role: role.key, resource: resource.key } },
        create: {
          role: role.key,
          resource: resource.key,
          ...defaultFlagsFor(role.key, resource.key),
        },
        update: {},
      })
    }
  }
}

export async function getRolePermissionMap(role: string): Promise<PermissionMap> {
  await ensureDefaultPermissions()
  const settings = await prisma.permissionSetting.findMany({ where: { role } })
  const map: PermissionMap = {}

  for (const resource of permissionResources) {
    map[resource.key] = defaultFlagsFor(role, resource.key)
  }

  for (const setting of settings) {
    map[setting.resource] = {
      canRead: setting.canRead,
      canCreate: setting.canCreate,
      canUpdate: setting.canUpdate,
      canDelete: setting.canDelete,
    }
  }

  return map
}

export async function hasResourcePermission(role: string, resource: PermissionResource, action: PermissionAction) {
  if (role === 'ADMIN') return true
  const permissions = await getRolePermissionMap(role)
  return Boolean(permissions[resource]?.[actionField[action]])
}

export async function requireResourcePermission(resource: PermissionResource, action: PermissionAction) {
  const current = await getCurrentOperator()
  if (!current || !(await hasResourcePermission(current.role, resource, action))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  return null
}

