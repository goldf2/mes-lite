import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManage, getCurrentOperator } from '@/lib/auth'
import {
  defaultFlagsFor,
  ensureDefaultPermissions,
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

const updateSchema = z.object({
  settings: z.array(settingSchema),
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
  const settings = await prisma.permissionSetting.findMany({
    orderBy: [{ role: 'asc' }, { resource: 'asc' }],
  })

  return NextResponse.json({
    data: {
      roles: permissionRoles,
      resources: permissionResources,
      actions: permissionActions,
      settings,
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
    const { settings } = updateSchema.parse(body)
    const validResources = new Set<string>(permissionResources.map((item) => item.key))

    for (const setting of settings) {
      if (!validResources.has(setting.resource)) {
        return NextResponse.json({ error: `未知功能页：${setting.resource}` }, { status: 400 })
      }
    }

    await ensureDefaultPermissions()
    await prisma.$transaction(
      settings.map((setting) => {
        const flags = setting.role === 'ADMIN' ? defaultFlagsFor('ADMIN', setting.resource) : {
          canRead: setting.canRead,
          canCreate: setting.canCreate,
          canUpdate: setting.canUpdate,
          canDelete: setting.canDelete,
        }

        return prisma.permissionSetting.upsert({
          where: { role_resource: { role: setting.role, resource: setting.resource } },
          create: {
            role: setting.role,
            resource: setting.resource,
            ...flags,
          },
          update: flags,
        })
      })
    )

    return NextResponse.json({ success: true, message: '权限已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update permissions error:', error)
    return NextResponse.json({ error: '保存权限失败' }, { status: 500 })
  }
}
