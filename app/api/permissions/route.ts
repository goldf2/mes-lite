import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManage, getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import {
  defaultFlagsFor,
  ensureDefaultPermissions,
  getRolePermissionMap,
  permissionActions,
  permissionResources,
  permissionRoles,
} from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const settingSchema = z.object({
  role: z.enum(['OPERATOR', 'AUDITOR', 'ADMIN']),
  resource: z.string().min(1),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
})

const operatorOverrideSchema = z.object({
  resource: z.string().min(1),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
})

const updateSchema = z.object({
  settings: z.array(settingSchema).optional(),
  operatorId: z.string().optional(),
  operatorOverrides: z.array(operatorOverrideSchema).optional(),
})

function assertAdmin(role: string) {
  return role === 'ADMIN'
}

function flagsEqual(
  a: { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean },
  b: { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }
) {
  return a.canRead === b.canRead &&
    a.canCreate === b.canCreate &&
    a.canUpdate === b.canUpdate &&
    a.canDelete === b.canDelete
}

export async function GET() {
  const current = await getCurrentOperator()
  if (!current || !assertAdmin(current.role)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  await ensureDefaultPermissions()
  const settings = await prisma.permissionSetting.findMany({
    orderBy: [{ role: 'asc' }, { resource: 'asc' }],
  })
  const operators = await prisma.operator.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  const operatorOverrides = await prisma.operatorPermissionOverride.findMany({
    orderBy: [{ operatorId: 'asc' }, { resource: 'asc' }],
  })

  return NextResponse.json({
    data: {
      roles: permissionRoles,
      resources: permissionResources,
      actions: permissionActions,
      settings,
      operators,
      operatorOverrides,
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
    const { settings = [], operatorId, operatorOverrides } = updateSchema.parse(body)
    const validResources = new Set<string>(permissionResources.map((item) => item.key))

    for (const setting of settings) {
      if (!validResources.has(setting.resource)) {
        return NextResponse.json({ error: `未知功能页：${setting.resource}` }, { status: 400 })
      }
    }
    for (const override of operatorOverrides || []) {
      if (!validResources.has(override.resource)) {
        return NextResponse.json({ error: `未知功能页：${override.resource}` }, { status: 400 })
      }
    }

    await ensureDefaultPermissions()
    const beforeRoleSettings = settings.length > 0
      ? await prisma.permissionSetting.findMany({
          where: {
            OR: settings.map((setting) => ({ role: setting.role, resource: setting.resource })),
          },
        })
      : []
    const operator = operatorId
      ? await prisma.operator.findUnique({
          where: { id: operatorId },
          select: { id: true, username: true, name: true, role: true },
        })
      : null

    if (operatorId && !operator) {
      return NextResponse.json({ error: '操作人员不存在' }, { status: 404 })
    }

    const beforeOperatorOverrides = operatorId
      ? await prisma.operatorPermissionOverride.findMany({ where: { operatorId } })
      : []
    const operatorRolePermissions = operator ? await getRolePermissionMap(operator.role) : null

    await prisma.$transaction(async (tx) => {
      for (const setting of settings) {
        const flags = setting.role === 'ADMIN' ? defaultFlagsFor('ADMIN', setting.resource) : {
          canRead: setting.canRead,
          canCreate: setting.canCreate,
          canUpdate: setting.canUpdate,
          canDelete: setting.canDelete,
        }

        await tx.permissionSetting.upsert({
          where: { role_resource: { role: setting.role, resource: setting.resource } },
          create: {
            role: setting.role,
            resource: setting.resource,
            ...flags,
          },
          update: flags,
        })
      }

      if (operatorId && operator) {
        const requestedOverrides = operatorOverrides || []
        const requestedResources = new Set(requestedOverrides.map((override) => override.resource))

        if (requestedResources.size === 0) {
          await tx.operatorPermissionOverride.deleteMany({ where: { operatorId } })
        } else {
          await tx.operatorPermissionOverride.deleteMany({
            where: {
              operatorId,
              resource: { notIn: Array.from(requestedResources) },
            },
          })
        }

        for (const override of requestedOverrides) {
          const roleFlags = operatorRolePermissions?.[override.resource] || defaultFlagsFor(operator.role, override.resource)
          if (flagsEqual(roleFlags, override)) {
            await tx.operatorPermissionOverride.deleteMany({
              where: {
                operatorId,
                resource: override.resource,
              },
            })
            continue
          }

          await tx.operatorPermissionOverride.upsert({
            where: { operatorId_resource: { operatorId, resource: override.resource } },
            create: {
              operatorId,
              resource: override.resource,
              canRead: override.canRead,
              canCreate: override.canCreate,
              canUpdate: override.canUpdate,
              canDelete: override.canDelete,
            },
            update: {
              canRead: override.canRead,
              canCreate: override.canCreate,
              canUpdate: override.canUpdate,
              canDelete: override.canDelete,
            },
          })
        }
      }
    })

    if (settings.length > 0) {
      await writeAuditLog(req, {
        action: 'UPDATE_ROLE_PERMISSION',
        entityType: 'PERMISSION_SETTING',
        beforeData: beforeRoleSettings,
        afterData: settings,
      })
    }
    if (operatorId && operator) {
      const afterOperatorOverrides = await prisma.operatorPermissionOverride.findMany({ where: { operatorId } })
      await writeAuditLog(req, {
        action: 'UPDATE_OPERATOR_PERMISSION',
        entityType: 'OPERATOR_PERMISSION_OVERRIDE',
        entityId: operatorId,
        entityLabel: `${operator.name} (${operator.username})`,
        beforeData: beforeOperatorOverrides,
        afterData: afterOperatorOverrides,
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
