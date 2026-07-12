import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { getCurrentOperator } from './auth'

export const permissionRoles = [
  { key: 'OPERATOR', label: '录入' },
  { key: 'AUDITOR', label: '审核' },
  { key: 'ADMIN', label: '管理' },
] as const

export const defaultPermissionGroups = [
  { code: 'basic_entry', name: '基础录入组', role: 'OPERATOR', description: '适合普通录入人员，允许录入常用业务单据。' },
  { code: 'business_audit', name: '业务审核组', role: 'AUDITOR', description: '适合审核人员，允许处理业务状态流转和库存调整。' },
  { code: 'system_admin', name: '系统管理组', role: 'ADMIN', description: '系统内置管理权限组，默认拥有全部功能权限。' },
] as const

export const permissionActions = [
  { key: 'canRead', label: '查' },
  { key: 'canCreate', label: '增' },
  { key: 'canUpdate', label: '改' },
  { key: 'canDelete', label: '归档' },
  { key: 'canGrant', label: '授权' },
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
  { key: 'permissionUsers', label: '人员权限控制' },
  { key: 'permissionGroups', label: '组权限控制' },
  { key: 'permissions', label: '权限管理' },
  { key: 'attachments', label: '原始单据附件' },
] as const

export type PermissionRole = (typeof permissionRoles)[number]['key']
export type PermissionResource = (typeof permissionResources)[number]['key']
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'grant'
export type PermissionSubject = { id?: string; role: string }

export type PermissionFlags = {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canGrant: boolean
}

export type PermissionMap = Record<string, PermissionFlags>

const allOn: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: true, canGrant: true }
const readOnly: PermissionFlags = { canRead: true, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }
const readCreate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: false, canDelete: false, canGrant: false }
const readCreateUpdate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false }
const none: PermissionFlags = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }

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
  permissionUsers: none,
  permissionGroups: none,
  permissions: none,
  attachments: readCreate,
}

const auditorDefaults: PermissionMap = {
  dashboard: readOnly,
  orders: readCreateUpdate,
  materials: readOnly,
  materialIn: readCreateUpdate,
  dispatch: readCreateUpdate,
  stocks: { canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
  shipment: readCreateUpdate,
  return: readCreateUpdate,
  stats: readOnly,
  operators: { canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
  system: none,
  permissionUsers: none,
  permissionGroups: none,
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
  grant: 'canGrant',
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

  for (const group of defaultPermissionGroups) {
    const savedGroup = await prisma.permissionGroup.upsert({
      where: { code: group.code },
      create: {
        code: group.code,
        name: group.name,
        description: group.description,
        isSystem: true,
      },
      update: {
        name: group.name,
        description: group.description,
        isSystem: true,
      },
    })

    for (const resource of permissionResources) {
      await prisma.permissionGroupSetting.upsert({
        where: { groupId_resource: { groupId: savedGroup.id, resource: resource.key } },
        create: {
          groupId: savedGroup.id,
          resource: resource.key,
          ...defaultFlagsFor(group.role, resource.key),
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
      canGrant: setting.canGrant,
    }
  }

  return map
}

export async function getEffectivePermissionMap(subject: PermissionSubject | string): Promise<PermissionMap> {
  const current = typeof subject === 'string' ? { role: subject } : subject
  const map: PermissionMap = {}

  for (const resource of permissionResources) {
    map[resource.key] = cloneFlags(none)
  }

  if (current.role === 'ADMIN') {
    return getRolePermissionMap('ADMIN')
  }

  if (!current.id) return getRolePermissionMap(current.role)

  const validResources = new Set<string>(permissionResources.map((resource) => resource.key))
  const groupLinks = await prisma.operatorPermissionGroup.findMany({
    where: { operatorId: current.id },
    include: { group: { include: { settings: true } } },
  })

  if (groupLinks.length === 0) {
    Object.assign(map, await getRolePermissionMap(current.role))
  }

  for (const link of groupLinks) {
    for (const setting of link.group.settings) {
      if (!validResources.has(setting.resource)) continue
      const currentFlags = map[setting.resource] || cloneFlags(none)
      map[setting.resource] = {
        canRead: currentFlags.canRead || setting.canRead,
        canCreate: currentFlags.canCreate || setting.canCreate,
        canUpdate: currentFlags.canUpdate || setting.canUpdate,
        canDelete: currentFlags.canDelete || setting.canDelete,
        canGrant: currentFlags.canGrant || setting.canGrant,
      }
    }
  }

  const overrides = await prisma.operatorPermissionOverride.findMany({
    where: { operatorId: current.id },
  })

  for (const override of overrides) {
    if (!validResources.has(override.resource)) continue
    map[override.resource] = {
      canRead: override.canRead,
      canCreate: override.canCreate,
      canUpdate: override.canUpdate,
      canDelete: override.canDelete,
      canGrant: override.canGrant,
    }
  }

  return map
}

export async function hasResourcePermission(subject: PermissionSubject | string, resource: PermissionResource, action: PermissionAction) {
  const current = typeof subject === 'string' ? { role: subject } : subject
  if (current.role === 'ADMIN') return true
  const permissions = await getEffectivePermissionMap(current)
  return Boolean(permissions[resource]?.[actionField[action]])
}

export async function requireResourcePermission(resource: PermissionResource, action: PermissionAction) {
  const current = await getCurrentOperator()
  if (!current || !(await hasResourcePermission(current, resource, action))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  return null
}
