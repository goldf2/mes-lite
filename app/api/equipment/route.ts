import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { equipmentIdSchema, equipmentInputSchema, equipmentUpdateSchema } from '@/modules/equipment/contracts/equipment-schema'
import { EquipmentDomainError } from '@/modules/equipment/domain/equipment-errors'
import { archiveManagedEquipment, createManagedEquipment, updateManagedEquipment } from '@/modules/equipment/server/equipment-command-service'
import { getEquipmentStatuses, listManagedEquipment } from '@/modules/equipment/server/equipment-query-service'

export const dynamic = 'force-dynamic'

function equipmentHttpError(error: unknown, fallback: string) {
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
    const denied = await requireResourcePermission('equipment', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const items = await listManagedEquipment({
      keyword: searchParams.get('keyword'),
      workCenterId: searchParams.get('workCenterId'),
      includeArchived: searchParams.get('includeArchived') === '1',
    })
    return NextResponse.json({ data: items, statuses: getEquipmentStatuses() })
  } catch (error) {
    return equipmentHttpError(error, '获取设备失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'create')
    if (denied) return denied
    const saved = await createManagedEquipment(equipmentInputSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: saved }, { status: 201 })
  } catch (error) {
    return equipmentHttpError(error, '新增设备失败')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'update')
    if (denied) return denied
    const { id, ...input } = equipmentUpdateSchema.parse(await req.json())
    const { existing, saved } = await updateManagedEquipment(id, input)
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: saved })
  } catch (error) {
    return equipmentHttpError(error, '更新设备失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'delete')
    if (denied) return denied
    const id = equipmentIdSchema.parse(new URL(req.url).searchParams.get('id'))
    const { existing, saved } = await archiveManagedEquipment(id)
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: saved, message: '设备已归档' })
  } catch (error) {
    return equipmentHttpError(error, '归档设备失败')
  }
}
