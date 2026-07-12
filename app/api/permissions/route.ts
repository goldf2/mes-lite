import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManage, getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import {
  ensureDefaultPermissions,
  permissionActions,
  permissionResources,
  permissionRoles,
} from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const groupSettingSchema = z.object({
  resource: z.string().min(1),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
})

const operatorGroupSchema = z.object({
  operatorId: z.string().min(1),
  groupIds: z.array(z.string()),
})

const updateSchema = z.object({
  groupId: z.string().optional(),
  groupSettings: z.array(groupSettingSchema).optional(),
  operatorGroups: z.array(operatorGroupSchema).optional(),
})

function assertAdmin(role: string) {
  return role === 'ADMIN'
}

export async function GET() {
  const current = await getCurrentOperator()
  if (!current || !assertAdmin(current.role)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  await ensureDefaultPermissions()
  const [settings, operators, groups, operatorGroups] = await Promise.all([
    prisma.permissionSetting.findMany({
      orderBy: [{ role: 'asc' }, { resource: 'asc' }],
    }),
    prisma.operator.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.permissionGroup.findMany({
      include: { settings: true },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.operatorPermissionGroup.findMany({
      orderBy: [{ operatorId: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  return NextResponse.json({
    data: {
      roles: permissionRoles,
      resources: permissionResources,
      actions: permissionActions,
      settings,
      operators,
      groups,
      operatorGroups,
    },
  })
}

export async function PUT(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current || !canManage(current.role)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { groupId, groupSettings, operatorGroups } = updateSchema.parse(body)
    const validResources = new Set<string>(permissionResources.map((item) => item.key))

    for (const setting of groupSettings || []) {
      if (!validResources.has(setting.resource)) {
        return NextResponse.json({ error: `未知功能页：${setting.resource}` }, { status: 400 })
      }
    }

    await ensureDefaultPermissions()
    const validGroups = new Set((await prisma.permissionGroup.findMany({ select: { id: true } })).map((group) => group.id))
    const validOperators = new Set((await prisma.operator.findMany({ select: { id: true } })).map((operator) => operator.id))

    if (groupId && !validGroups.has(groupId)) {
      return NextResponse.json({ error: '权限组不存在' }, { status: 404 })
    }

    for (const item of operatorGroups || []) {
      if (!validOperators.has(item.operatorId)) {
        return NextResponse.json({ error: '操作人员不存在' }, { status: 404 })
      }
      for (const id of item.groupIds) {
        if (!validGroups.has(id)) {
          return NextResponse.json({ error: '权限组不存在' }, { status: 404 })
        }
      }
    }

    const beforeGroupSettings = groupId
      ? await prisma.permissionGroupSetting.findMany({ where: { groupId } })
      : []
    const beforeOperatorGroups = operatorGroups?.length
      ? await prisma.operatorPermissionGroup.findMany({
          where: { operatorId: { in: operatorGroups.map((item) => item.operatorId) } },
        })
      : []

    await prisma.$transaction(async (tx) => {
      if (groupId && groupSettings) {
        const requestedResources = new Set(groupSettings.map((setting) => setting.resource))

        if (requestedResources.size === 0) {
          await tx.permissionGroupSetting.deleteMany({ where: { groupId } })
        } else {
          await tx.permissionGroupSetting.deleteMany({
            where: {
              groupId,
              resource: { notIn: Array.from(requestedResources) },
            },
          })
        }

        for (const setting of groupSettings) {
          await tx.permissionGroupSetting.upsert({
            where: { groupId_resource: { groupId, resource: setting.resource } },
            create: {
              groupId,
              resource: setting.resource,
              canRead: setting.canRead,
              canCreate: setting.canCreate,
              canUpdate: setting.canUpdate,
              canDelete: setting.canDelete,
            },
            update: {
              canRead: setting.canRead,
              canCreate: setting.canCreate,
              canUpdate: setting.canUpdate,
              canDelete: setting.canDelete,
            },
          })
        }
      }

      for (const item of operatorGroups || []) {
        await tx.operatorPermissionGroup.deleteMany({ where: { operatorId: item.operatorId } })
        for (const assignedGroupId of item.groupIds) {
          await tx.operatorPermissionGroup.create({
            data: {
              operatorId: item.operatorId,
              groupId: assignedGroupId,
            },
          })
        }
      }
    })

    if (groupId && groupSettings) {
      const group = await prisma.permissionGroup.findUnique({ where: { id: groupId } })
      const afterGroupSettings = await prisma.permissionGroupSetting.findMany({ where: { groupId } })
      await writeAuditLog(req, {
        action: 'UPDATE_PERMISSION_GROUP',
        entityType: 'PERMISSION_GROUP',
        entityId: groupId,
        entityLabel: group?.name,
        beforeData: beforeGroupSettings,
        afterData: afterGroupSettings,
      })
    }

    if (operatorGroups?.length) {
      const afterOperatorGroups = await prisma.operatorPermissionGroup.findMany({
        where: { operatorId: { in: operatorGroups.map((item) => item.operatorId) } },
      })
      await writeAuditLog(req, {
        action: 'UPDATE_OPERATOR_PERMISSION_GROUP',
        entityType: 'OPERATOR_PERMISSION_GROUP',
        beforeData: beforeOperatorGroups,
        afterData: afterOperatorGroups,
      })
    }

    return NextResponse.json({ success: true, message: '权限已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update permissions error:', error)
    return NextResponse.json({ error: '保存权限失败' }, { status: 500 })
  }
}
