import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { getEffectivePermissionMap, requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'

export const dynamic = 'force-dynamic'

const fields = z.object({
  code: z.string().min(1, '工作中心编码必填').max(40),
  name: z.string().min(1, '工作中心名称必填').max(80),
  category: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
})

const updateSchema = fields.partial().extend({ id: z.string().min(1) })

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

async function listWorkCenters(includeInactive = false) {
  return prisma.workCenter.findMany({
    where: includeInactive ? {} : { isActive: true, deletedAt: null },
    include: { _count: { select: { equipment: true, workInstructions: true } } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
}

export async function GET(req: NextRequest) {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const permissions = await getEffectivePermissionMap(operator)
  const readable = operator.role === 'ADMIN'
    || permissions.system?.canRead
    || permissions.equipment?.canRead
    || permissions.workInstructions?.canRead
  if (!readable) return NextResponse.json({ error: '无权限' }, { status: 403 })
  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
  return NextResponse.json({ data: await listWorkCenters(includeInactive) })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied
    const body = fields.parse(await req.json())
    const saved = await prisma.$transaction(async (tx) => tx.workCenter.create({
      data: {
        code: normalizeCode(body.code),
        name: body.name.trim(),
        category: body.category?.trim() || null,
        note: body.note?.trim() || null,
        isActive: body.isActive ?? true,
        sortOrder: await nextConfigurationSortOrder(tx, 'workCenters'),
      },
    }))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: await listWorkCenters(true) }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '工作中心编码已存在' }, { status: 409 })
    }
    console.error('Create work center error:', error)
    return NextResponse.json({ error: '新增工作中心失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const body = updateSchema.parse(await req.json())
    const before = await prisma.workCenter.findUnique({ where: { id: body.id } })
    if (!before) return NextResponse.json({ error: '工作中心不存在' }, { status: 404 })
    const saved = await prisma.workCenter.update({
      where: { id: body.id },
      data: {
        ...(body.code === undefined ? {} : { code: normalizeCode(body.code) }),
        ...(body.name === undefined ? {} : { name: body.name.trim() }),
        ...(body.category === undefined ? {} : { category: body.category?.trim() || null }),
        ...(body.note === undefined ? {} : { note: body.note?.trim() || null }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive, deletedAt: body.isActive ? null : before.deletedAt }),
      },
    })
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: before, afterData: saved,
    })
    return NextResponse.json({ data: await listWorkCenters(true) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '工作中心编码已存在' }, { status: 409 })
    }
    console.error('Update work center error:', error)
    return NextResponse.json({ error: '更新工作中心失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少工作中心 ID' }, { status: 400 })
    const before = await prisma.workCenter.findUnique({
      where: { id },
      include: { _count: { select: { equipment: true } } },
    })
    if (!before) return NextResponse.json({ error: '工作中心不存在' }, { status: 404 })
    if (before._count.equipment > 0) {
      return NextResponse.json({ error: '工作中心仍有设备引用，请先调整设备归属' }, { status: 409 })
    }
    const saved = await prisma.workCenter.update({
      where: { id }, data: { isActive: false, deletedAt: new Date() },
    })
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'WORK_CENTER', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: before, afterData: saved,
    })
    return NextResponse.json({ data: await listWorkCenters(true) })
  } catch (error) {
    console.error('Archive work center error:', error)
    return NextResponse.json({ error: '归档工作中心失败' }, { status: 500 })
  }
}
