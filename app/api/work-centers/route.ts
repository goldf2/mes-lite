import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { getEffectivePermissionMap, requireResourcePermission } from '@/lib/permissions'
import { workCenterFieldsSchema, workCenterIdSchema, workCenterUpdateSchema } from '@/modules/equipment/contracts/work-center-schema'
import { EquipmentDomainError } from '@/modules/equipment/domain/equipment-errors'
import { archiveManagedWorkCenter, createManagedWorkCenter, updateManagedWorkCenter } from '@/modules/equipment/server/work-center-command-service'
import { listManagedWorkCenters } from '@/modules/equipment/server/work-center-query-service'

export const dynamic = 'force-dynamic'

function workCenterHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
  }
  if (error instanceof EquipmentDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const permissions = await getEffectivePermissionMap(operator)
    const readable = operator.role === 'ADMIN'
      || permissions.system?.canRead
      || permissions.equipment?.canRead
      || permissions.workInstructions?.canRead
    if (!readable) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
    return NextResponse.json({ data: await listManagedWorkCenters(includeInactive) })
  } catch (error) {
    return workCenterHttpError(error, '获取工作中心失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied
    const saved = await createManagedWorkCenter(workCenterFieldsSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedWorkCenters(true) }, { status: 201 })
  } catch (error) {
    return workCenterHttpError(error, '新增工作中心失败')
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const { existing, saved } = await updateManagedWorkCenter(workCenterUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedWorkCenters(true) })
  } catch (error) {
    return workCenterHttpError(error, '更新工作中心失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied
    const id = workCenterIdSchema.parse(new URL(req.url).searchParams.get('id'))
    const { existing, saved } = await archiveManagedWorkCenter(id)
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedWorkCenters(true) })
  } catch (error) {
    return workCenterHttpError(error, '归档工作中心失败')
  }
}
