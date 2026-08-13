import { canManage } from '@/lib/auth'
import {
  ensureDefaultPermissions,
  getEffectivePermissionMap,
  hasResourcePermission,
  permissionActions,
  permissionResources,
  permissionResourceSection,
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
  const [settings, operators, groups, operatorGroups, operatorPermissionOverrides, savedDataScopes, workCenters, locations] = await Promise.all([
    prisma.permissionSetting.findMany({ orderBy: [{ role: 'asc' }, { resource: 'asc' }] }),
    prisma.operator.findMany({
      select: {
        id: true, username: true, name: true, role: true, status: true,
        employee: { select: { id: true, code: true, name: true, department: true, isActive: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.permissionGroup.findMany({ include: { settings: true }, orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] }),
    prisma.operatorPermissionGroup.findMany({ orderBy: [{ operatorId: 'asc' }, { createdAt: 'asc' }] }),
    prisma.operatorPermissionOverride.findMany({ orderBy: [{ operatorId: 'asc' }, { resource: 'asc' }] }),
    prisma.operatorDataScope.findMany({
      include: {
        workCenters: { select: { workCenterId: true } },
        locations: { select: { locationId: true } },
      },
    }),
    prisma.workCenter.findMany({
      where: { isActive: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' },
    }),
    prisma.inventoryLocation.findMany({
      where: { isActive: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' },
    }),
  ])
  const dataScopeByOperator = new Map(savedDataScopes.map((scope) => [scope.operatorId, scope]))
  const operatorDataScopes = operators.map((operator) => {
    const saved = dataScopeByOperator.get(operator.id)
    return saved ? {
      operatorId: operator.id,
      productionMode: saved.productionMode,
      inventoryMode: saved.inventoryMode,
      workCenterIds: saved.workCenters.map((item) => item.workCenterId),
      locationIds: saved.locations.map((item) => item.locationId),
      inheritedLegacyDefault: false,
    } : {
      operatorId: operator.id,
      productionMode: 'ALL',
      inventoryMode: 'ALL',
      workCenterIds: [],
      locationIds: [],
      inheritedLegacyDefault: true,
    }
  })
  return {
    roles: permissionRoles,
    resources: permissionResources.map((resource) => ({ ...resource, section: permissionResourceSection(resource.key) })),
    actions: permissionActions, settings, operators, groups, operatorGroups,
    operatorPermissionOverrides: operatorPermissionOverrides.map((item) => ({
      ...item,
      startsAt: item.startsAt?.toISOString() || null,
      expiresAt: item.expiresAt?.toISOString() || null,
    })),
    operatorDataScopes, workCenters, locations,
  }
}

export async function updatePermissionAdministration(actor: PermissionActor, input: UpdatePermissionsInput) {
  const permissions = await actorPermissions(actor)
  if (!canAssignOperators(actor, permissions) && !canEditGroups(actor, permissions)) {
    throw new PermissionAdminError('无权限', 403)
  }
  const { groupId, groupSettings, operatorGroups, operatorDataScopes, operatorPermissionOverrides } = input
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
  for (const item of operatorPermissionOverrides || []) {
    if (!canAssignOperators(actor, permissions)) throw new PermissionAdminError('无权维护个人临时授权', 403)
    if (!validOperators.has(item.operatorId)) throw new PermissionAdminError('操作人员不存在', 404)
    if (!validResources.has(item.resource)) throw new PermissionAdminError(`未知功能页：${item.resource}`)
    if (!isPermissionAdmin(actor.role) && !permissions[item.resource]?.canGrant) {
      throw new PermissionAdminError(`无权维护「${item.resource}」的个人授权`, 403)
    }
    if (item.action === 'DELETE') continue
    if (!item.reason?.trim()) throw new PermissionAdminError('个人临时授权必须填写原因')
    if (!item.startsAt || !item.expiresAt) throw new PermissionAdminError('个人临时授权必须设置开始和失效时间')
    const startsAt = new Date(item.startsAt)
    const expiresAt = new Date(item.expiresAt)
    if (expiresAt <= startsAt) throw new PermissionAdminError('个人临时授权失效时间必须晚于开始时间')
    if (expiresAt <= new Date()) throw new PermissionAdminError('个人临时授权失效时间必须晚于当前时间')
    if (!isPermissionAdmin(actor.role) && item.canGrant) throw new PermissionAdminError('个人授权权限只能由超级管理员授予', 403)
  }
  const operatorsWithEmployees = await prisma.operator.findMany({
    where: { id: { in: (operatorDataScopes || []).map((item) => item.operatorId) } },
    select: { id: true, role: true, employee: { select: { id: true, isActive: true } } },
  })
  const operatorById = new Map(operatorsWithEmployees.map((operator) => [operator.id, operator]))
  const validWorkCenters = new Set((await prisma.workCenter.findMany({
    where: { isActive: true, deletedAt: null }, select: { id: true },
  })).map((item) => item.id))
  const validLocations = new Set((await prisma.inventoryLocation.findMany({
    where: { isActive: true, deletedAt: null }, select: { id: true },
  })).map((item) => item.id))
  for (const item of operatorDataScopes || []) {
    if (!canAssignOperators(actor, permissions)) throw new PermissionAdminError('无权维护人员数据范围', 403)
    const operator = operatorById.get(item.operatorId)
    if (!operator) throw new PermissionAdminError('操作人员不存在', 404)
    if (operator.role === 'ADMIN') throw new PermissionAdminError('管理账号固定使用全厂数据范围')
    if (item.productionMode === 'SELF' && (!operator.employee || !operator.employee.isActive)) {
      throw new PermissionAdminError('本人范围要求账号绑定一个在职员工')
    }
    if (item.productionMode === 'WORK_CENTERS' && item.workCenterIds.length === 0) {
      throw new PermissionAdminError('指定工作中心范围至少选择一个工作中心')
    }
    if (item.inventoryMode === 'LOCATIONS' && item.locationIds.length === 0) {
      throw new PermissionAdminError('指定库位范围至少选择一个库位')
    }
    if (item.workCenterIds.some((id) => !validWorkCenters.has(id))) throw new PermissionAdminError('工作中心不存在或已停用')
    if (item.locationIds.some((id) => !validLocations.has(id))) throw new PermissionAdminError('库位不存在或已停用')
  }
  if (groupId && groupSettings && !canEditGroups(actor, permissions)) throw new PermissionAdminError('无权维护权限组', 403)

  const beforeGroupSettings = groupId ? await prisma.permissionGroupSetting.findMany({ where: { groupId } }) : []
  const affectedOperatorIds = operatorGroups?.map((item) => item.operatorId) || []
  const beforeOperatorGroups = affectedOperatorIds.length > 0
    ? await prisma.operatorPermissionGroup.findMany({ where: { operatorId: { in: affectedOperatorIds } } })
    : []
  const affectedScopeOperatorIds = operatorDataScopes?.map((item) => item.operatorId) || []
  const beforeOperatorDataScopes = affectedScopeOperatorIds.length > 0
    ? await prisma.operatorDataScope.findMany({
      where: { operatorId: { in: affectedScopeOperatorIds } }, include: { workCenters: true, locations: true },
    }) : []
  const affectedOverrideOperatorIds = Array.from(new Set(operatorPermissionOverrides?.map((item) => item.operatorId) || []))
  const beforeOperatorPermissionOverrides = affectedOverrideOperatorIds.length > 0
    ? await prisma.operatorPermissionOverride.findMany({ where: { operatorId: { in: affectedOverrideOperatorIds } } })
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
    for (const item of operatorDataScopes || []) {
      await tx.operatorDataScope.upsert({
        where: { operatorId: item.operatorId },
        create: { operatorId: item.operatorId, productionMode: item.productionMode, inventoryMode: item.inventoryMode },
        update: { productionMode: item.productionMode, inventoryMode: item.inventoryMode },
      })
      await tx.operatorWorkCenterScope.deleteMany({ where: { operatorId: item.operatorId } })
      await tx.operatorInventoryLocationScope.deleteMany({ where: { operatorId: item.operatorId } })
      if (item.productionMode === 'WORK_CENTERS') {
        await tx.operatorWorkCenterScope.createMany({
          data: item.workCenterIds.map((workCenterId) => ({ operatorId: item.operatorId, workCenterId })),
        })
      }
      if (item.inventoryMode === 'LOCATIONS') {
        await tx.operatorInventoryLocationScope.createMany({
          data: item.locationIds.map((locationId) => ({ operatorId: item.operatorId, locationId })),
        })
      }
    }
    for (const item of operatorPermissionOverrides || []) {
      if (item.action === 'DELETE') {
        await tx.operatorPermissionOverride.deleteMany({ where: { operatorId: item.operatorId, resource: item.resource } })
        continue
      }
      const flags = {
        canRead: Boolean(item.canRead), canCreate: Boolean(item.canCreate), canUpdate: Boolean(item.canUpdate),
        canDelete: Boolean(item.canDelete), canGrant: isPermissionAdmin(actor.role) ? Boolean(item.canGrant) : false,
      }
      await tx.operatorPermissionOverride.upsert({
        where: { operatorId_resource: { operatorId: item.operatorId, resource: item.resource } },
        create: {
          operatorId: item.operatorId, resource: item.resource, ...flags,
          reason: item.reason!.trim(), grantedBy: actor.id,
          startsAt: new Date(item.startsAt!), expiresAt: new Date(item.expiresAt!), legacyPermanent: false,
        },
        update: {
          ...flags, reason: item.reason!.trim(), grantedBy: actor.id,
          startsAt: new Date(item.startsAt!), expiresAt: new Date(item.expiresAt!), legacyPermanent: false,
        },
      })
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
  const scopeAudit = affectedScopeOperatorIds.length > 0 ? {
    beforeData: beforeOperatorDataScopes,
    afterData: await prisma.operatorDataScope.findMany({
      where: { operatorId: { in: affectedScopeOperatorIds } }, include: { workCenters: true, locations: true },
    }),
  } : null
  const overrideAudit = affectedOverrideOperatorIds.length > 0 ? {
    beforeData: beforeOperatorPermissionOverrides,
    afterData: await prisma.operatorPermissionOverride.findMany({ where: { operatorId: { in: affectedOverrideOperatorIds } } }),
  } : null
  return { groupAudit, operatorAudit, scopeAudit, overrideAudit }
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
