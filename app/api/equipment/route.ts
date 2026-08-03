import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const equipmentStatuses = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'STOPPED'] as const

const fields = z.object({
  code: z.string().min(1, '设备编码必填').max(40),
  name: z.string().min(1, '设备名称必填').max(100),
  equipmentType: z.string().min(1, '设备类型必填').max(80),
  workCenterId: z.string().min(1, '请选择工作中心'),
  model: z.string().max(100).optional().nullable(),
  manufacturer: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  status: z.enum(equipmentStatuses).optional(),
  location: z.string().max(100).optional().nullable(),
  basicParameters: z.string().max(4000).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
})

const updateSchema = fields.extend({ id: z.string().min(1) })
const include = { workCenter: { select: { id: true, code: true, name: true, isActive: true } } } as const

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

async function validateWorkCenter(id: string) {
  return prisma.workCenter.findFirst({ where: { id, isActive: true, deletedAt: null }, select: { id: true } })
}

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('equipment', 'read')
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()
  const workCenterId = searchParams.get('workCenterId')?.trim()
  const includeArchived = searchParams.get('includeArchived') === '1'
  const where: Prisma.EquipmentWhereInput = {
    ...(includeArchived ? {} : { deletedAt: null }),
    ...(workCenterId ? { workCenterId } : {}),
    ...(keyword ? {
      OR: [
        { code: { contains: keyword } }, { name: { contains: keyword } },
        { equipmentType: { contains: keyword } }, { model: { contains: keyword } },
        { manufacturer: { contains: keyword } }, { serialNumber: { contains: keyword } },
        { workCenter: { is: { name: { contains: keyword } } } },
      ],
    } : {}),
  }
  const items = await prisma.equipment.findMany({ where, include, orderBy: [{ deletedAt: 'asc' }, { code: 'asc' }] })
  return NextResponse.json({ data: items, statuses: equipmentStatuses })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'create')
    if (denied) return denied
    const body = fields.parse(await req.json())
    if (!await validateWorkCenter(body.workCenterId)) return NextResponse.json({ error: '工作中心不存在或已停用' }, { status: 400 })
    const saved = await prisma.equipment.create({
      data: {
        code: normalizeCode(body.code), name: body.name.trim(), equipmentType: body.equipmentType.trim(),
        workCenterId: body.workCenterId, model: body.model?.trim() || null,
        manufacturer: body.manufacturer?.trim() || null, serialNumber: body.serialNumber?.trim() || null,
        status: body.status || 'AVAILABLE', location: body.location?.trim() || null,
        basicParameters: body.basicParameters?.trim() || null, note: body.note?.trim() || null,
      },
      include,
    })
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: saved }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: '设备编码已存在' }, { status: 409 })
    console.error('Create equipment error:', error)
    return NextResponse.json({ error: '新增设备失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'update')
    if (denied) return denied
    const body = updateSchema.parse(await req.json())
    const before = await prisma.equipment.findUnique({ where: { id: body.id }, include })
    if (!before || before.deletedAt) return NextResponse.json({ error: '设备不存在或已归档' }, { status: 404 })
    if (!await validateWorkCenter(body.workCenterId)) return NextResponse.json({ error: '工作中心不存在或已停用' }, { status: 400 })
    const saved = await prisma.equipment.update({
      where: { id: body.id },
      data: {
        code: normalizeCode(body.code), name: body.name.trim(), equipmentType: body.equipmentType.trim(),
        workCenterId: body.workCenterId, model: body.model?.trim() || null,
        manufacturer: body.manufacturer?.trim() || null, serialNumber: body.serialNumber?.trim() || null,
        status: body.status || 'AVAILABLE', location: body.location?.trim() || null,
        basicParameters: body.basicParameters?.trim() || null, note: body.note?.trim() || null,
      },
      include,
    })
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: before, afterData: saved,
    })
    return NextResponse.json({ data: saved })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: '设备编码已存在' }, { status: 409 })
    console.error('Update equipment error:', error)
    return NextResponse.json({ error: '更新设备失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipment', 'delete')
    if (denied) return denied
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少设备 ID' }, { status: 400 })
    const before = await prisma.equipment.findUnique({ where: { id }, include })
    if (!before || before.deletedAt) return NextResponse.json({ error: '设备不存在或已归档' }, { status: 404 })
    const saved = await prisma.equipment.update({ where: { id }, data: { deletedAt: new Date(), status: 'STOPPED' }, include })
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'EQUIPMENT', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: before, afterData: saved,
    })
    return NextResponse.json({ data: saved, message: '设备已归档' })
  } catch (error) {
    console.error('Archive equipment error:', error)
    return NextResponse.json({ error: '归档设备失败' }, { status: 500 })
  }
}
