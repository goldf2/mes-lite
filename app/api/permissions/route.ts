import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import {
  createPermissionGroupSchema,
  updatePermissionsSchema,
} from '@/modules/identity-access/contracts/permission-admin'
import {
  createPermissionGroup,
  listPermissionAdministration,
  PermissionAdminError,
  updatePermissionAdministration,
} from '@/modules/identity-access/server/permission-admin-service'

function permissionError(error: unknown, fallback: string, operation: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof PermissionAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${operation} permissions error:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET() {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })
  try {
    return NextResponse.json({ data: await listPermissionAdministration(current) })
  } catch (error) {
    return permissionError(error, '读取权限失败', 'List')
  }
}

export async function PUT(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })
  try {
    const result = await updatePermissionAdministration(current, updatePermissionsSchema.parse(await req.json()))
    if (result.groupAudit) {
      await writeAuditLog(req, {
        action: 'UPDATE_PERMISSION_GROUP',
        entityType: 'PERMISSION_GROUP',
        ...result.groupAudit,
      })
    }
    if (result.operatorAudit) {
      await writeAuditLog(req, {
        action: 'UPDATE_OPERATOR_PERMISSION_GROUP',
        entityType: 'OPERATOR_PERMISSION_GROUP',
        ...result.operatorAudit,
      })
    }
    return NextResponse.json({ success: true, message: '权限已保存' })
  } catch (error) {
    return permissionError(error, '保存权限失败', 'Update')
  }
}

export async function POST(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })
  try {
    const group = await createPermissionGroup(current, createPermissionGroupSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE_PERMISSION_GROUP',
      entityType: 'PERMISSION_GROUP',
      entityId: group.id,
      entityLabel: group.name,
      afterData: group,
    })
    return NextResponse.json({ data: group, message: '权限组已创建' }, { status: 201 })
  } catch (error) {
    return permissionError(error, '创建权限组失败', 'Create')
  }
}
