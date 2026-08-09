import { canManage } from '@/lib/auth'
import {
  ensureDefaultPermissions,
  getEffectivePermissionMap,
  hasResourcePermission,
  permissionActions,
  permissionResources,
  permissionRoles,
  type PermissionMap,
  type PermissionResource,
} from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import type {
  CreatePermissionGroupInput,
  PermissionActor,
  UpdatePermissionsInput,
} from '../contracts/permission-admin'
import { hasAnyGrant, isPermissionAdmin, normalizePermissionGroupCode } from '../domain/permission-admin'

export class PermissionAdminError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 = 400) {
    super(message)
    this.name = 'PermissionAdminError'
  }
}

async function actorPermissions(actor: PermissionActor) {
  return getEffectivePermissionMap(actor)
}

function canOpen(actor: PermissionActor, permissions: PermissionMap) {
  return isPermissionAdmin(actor.role)
    || Boolean(permissions.permissionUsers?.canRead || permissions.permissionGroups?.canRead || hasAnyGrant(permissions))
}

function canAssignOperators(actor: PermissionActor, permissions: PermissionMap) {
  return isPermissionAdmin(actor.role) || Boolean(permissions.permissionUsers?.canUpdate || hasAnyGrant(permissions))
}

function canEditGroups(actor: PermissionActor, permissions: PermissionMap) {
  return isPermissionAdmin(actor.role) || Boolean(permissions.permissionGroups?.canUpdate || hasAnyGrant(permissions))
}

async function assertGroupsAssignable(groupIds: string[], actor: PermissionActor, permissions: PermissionMap) {
  if (isPermissionAdmin(actor.role)) return
  const groups = await prisma.permissionGroup.findMany({ where: { id: { in: groupIds } }, include: { settings: true } })
  for (const group of groups) {
    for (const setting of group.settings) {
      const enabled = setting.canRead || setting.canCreate || setting.canUpdate || setting.canDelete || setting.canGrant
      if (enabled && !permissions[setting.resource]?.canGrant) {
        throw new PermissionAdminError(`无权分配权限组「${group.name}」中的「${setting.resource}」权限`, 403)
      }
    }
  }
}

export async function listPermissionAdministration(actor: PermissionActor) {
  const permissions = await actorPermissions(actor)
  if (!canOpen(actor, permissions)) throw new PermissionAdminError('无权限', 403)
  await ensureDefaultPermissions()
  const [settings, operators, groups, operatorGroups] = await Promise.all([
    prisma.permissionSetting.findMany({ orderBy: [{ role: 'asc' }, { resource: 'asc' }] }),
    prisma.operator.findMany({
      select: { id: true, username: true, name: true, role: true, status: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.permissionGroup.findMany({ include: { settings: true }, orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] }),
    prisma.operatorPermissionGroup.findMany({ orderBy: [{ operatorId: 'asc' }, { createdAt: 'asc' }] }),
  ])
  return { roles: permissionRoles, resources: permissionResources, actions: permissionActions, settings, operators, groups, operatorGroups }
}

export async function updatePermissionAdministration(actor: PermissionActor, input: UpdatePermissionsInput) {
  const permissions = await actorPermissions(actor)
  if (!canAssignOperators(actor, permissions) && !canEditGroups(actor, permissions)) {
    throw new PermissionAdminError('无权限', 403)
  }
  const { groupId, groupSettings, operatorGroups } = input
  const validResources = new Set<string>(permissionResources.map((item) => item.key))
  for (const setting of groupSettings || []) {
    if (!validResources.has(setting.resource)) throw new PermissionAdminError(`未知功能页：${setting.resource}`)
    if (!isPermissionAdmin(actor.role) && !(await hasResourcePermission(actor, setting.resource as PermissionResource, 'grant'))) {
      throw new PermissionAdminError(`无权维护「${setting.resource}」的授权`, 403)
    }
    if (!isPermissionAdmin(actor.role) && setting.canGrant) throw new PermissionAdminError('授权权限只能由超级管理员维护', 403)
  }

  await ensureDefaultPermissions()
  const validGroups = new Set((await prisma.permissionGroup.findMany({ select: { id: true } })).map((group) => group.id))
  const validOperators = new Set((await prisma.operator.findMany({ select: { id: true } })).map((operator) => operator.id))
  if (groupId && !validGroups.has(groupId)) throw new PermissionAdminError('权限组不存在', 404)
  for (const item of operatorGroups || []) {
    if (!canAssignOperators(actor, permissions)) throw new PermissionAdminError('无权维护人员权限', 403)
    if (!validOperators.has(item.operatorId)) throw new PermissionAdminError('操作人员不存在', 404)
    if (item.groupIds.some((id) => !validGroups.has(id))) throw new PermissionAdminError('权限组不存在', 404)
    await assertGroupsAssignable(item.groupIds, actor, permissions)
  }
  if (groupId && groupSettings && !canEditGroups(actor, permissions)) throw new PermissionAdminError('无权维护权限组', 403)

  const beforeGroupSettings = groupId ? await prisma.permissionGroupSetting.findMany({ where: { groupId } }) : []
  const affectedOperatorIds = operatorGroups?.map((item) => item.operatorId) || []
  const beforeOperatorGroups = affectedOperatorIds.length > 0
    ? await prisma.operatorPermissionGroup.findMany({ where: { operatorId: { in: affectedOperatorIds } } })
    : []
  await prisma.$transaction(async (tx) => {
    if (groupId && groupSettings) {
      const requestedResources = new Set(groupSettings.map((setting) => setting.resource))
      await tx.permissionGroupSetting.deleteMany({
        where: { groupId, ...(requestedResources.size > 0 ? { resource: { notIn: Array.from(requestedResources) } } : {}) },
      })
      for (const setting of groupSettings) {
        const flags = {
          canRead: setting.canRead, canCreate: setting.canCreate, canUpdate: setting.canUpdate,
          canDelete: setting.canDelete, canGrant: isPermissionAdmin(actor.role) ? Boolean(setting.canGrant) : false,
        }
        await tx.permissionGroupSetting.upsert({
          where: { groupId_resource: { groupId, resource: setting.resource } },
          create: { groupId, resource: setting.resource, ...flags },
          update: flags,
        })
      }
    }
    for (const item of operatorGroups || []) {
      await tx.operatorPermissionGroup.deleteMany({ where: { operatorId: item.operatorId } })
      for (const assignedGroupId of item.groupIds) {
        await tx.operatorPermissionGroup.create({ data: { operatorId: item.operatorId, groupId: assignedGroupId } })
      }
    }
  })

  const groupAudit = groupId && groupSettings ? {
    entityId: groupId,
    entityLabel: (await prisma.permissionGroup.findUnique({ where: { id: groupId } }))?.name,
    beforeData: beforeGroupSettings,
    afterData: await prisma.permissionGroupSetting.findMany({ where: { groupId } }),
  } : null
  const operatorAudit = affectedOperatorIds.length > 0 ? {
    beforeData: beforeOperatorGroups,
    afterData: await prisma.operatorPermissionGroup.findMany({ where: { operatorId: { in: affectedOperatorIds } } }),
  } : null
  return { groupAudit, operatorAudit }
}

export async function createPermissionGroup(actor: PermissionActor, input: CreatePermissionGroupInput) {
  const permissions = await actorPermissions(actor)
  const allowed = canManage(actor.role)
    || await hasResourcePermission(actor, 'permissionGroups', 'create')
    || hasAnyGrant(permissions)
  if (!allowed) throw new PermissionAdminError('无权限', 403)
  await ensureDefaultPermissions()
  const code = normalizePermissionGroupCode(input.code || input.name)
  if (!code) throw new PermissionAdminError('权限组编码无效')
  if (await prisma.permissionGroup.findUnique({ where: { code } })) throw new PermissionAdminError('权限组编码已存在')
  return prisma.permissionGroup.create({
    data: {
      code, name: input.name.trim(), description: input.description?.trim() || null, isSystem: false,
      settings: { create: permissionResources.map((resource) => ({
        resource: resource.key, canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false,
      })) },
    },
    include: { settings: true },
  })
}
