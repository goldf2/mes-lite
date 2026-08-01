import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'

const locationFields = z.object({
  code: z.string().min(1, '库位编码必填').max(40),
  name: z.string().min(1, '库位名称必填').max(80),
  note: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const updateSchema = locationFields.partial().extend({ id: z.string().min(1) })

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

async function listLocations(includeInactive = false) {
  const locations = await prisma.inventoryLocation.findMany({
    where: includeInactive ? {} : { isActive: true, deletedAt: null },
    include: { balances: { select: { qty: true, reservedQty: true, availableQty: true } } },
    orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
  })
  return locations.map(({ balances, ...location }) => ({
    ...location,
    materialCount: balances.length,
    qty: balances.reduce((sum, item) => sum + Number(item.qty), 0),
    reservedQty: balances.reduce((sum, item) => sum + Number(item.reservedQty), 0),
    availableQty: balances.reduce((sum, item) => sum + Number(item.availableQty), 0),
  }))
}

export async function GET(req: NextRequest) {
  if (!await getCurrentOperator()) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
  return NextResponse.json({ data: await listLocations(includeInactive) })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const body = locationFields.parse(await req.json())
    const code = normalizeCode(body.code)
    const saved = await prisma.$transaction(async (tx) => {
      const activeCount = await tx.inventoryLocation.count({ where: { isActive: true, deletedAt: null } })
      const isDefault = body.isDefault === true || activeCount === 0
      if (isDefault) await tx.inventoryLocation.updateMany({ data: { isDefault: false } })
      return tx.inventoryLocation.create({
        data: {
          code,
          name: body.name.trim(),
          note: body.note?.trim() || null,
          isDefault,
          isActive: body.isActive ?? true,
        },
      })
    })
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: await listLocations(true) }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '库位编码已存在' }, { status: 409 })
    }
    console.error('Create inventory location error:', error)
    return NextResponse.json({ error: '新增库位失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const body = updateSchema.parse(await req.json())
    const existing = await prisma.inventoryLocation.findUnique({ where: { id: body.id } })
    if (!existing) return NextResponse.json({ error: '库位不存在' }, { status: 404 })
    if (existing.isDefault && (body.isDefault === false || body.isActive === false)) {
      return NextResponse.json({ error: '请先将其他库位设为默认库位，再停用当前默认库位' }, { status: 400 })
    }
    const saved = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) await tx.inventoryLocation.updateMany({ data: { isDefault: false } })
      return tx.inventoryLocation.update({
        where: { id: body.id },
        data: {
          ...(body.code === undefined ? {} : { code: normalizeCode(body.code) }),
          ...(body.name === undefined ? {} : { name: body.name.trim() }),
          ...(body.note === undefined ? {} : { note: body.note?.trim() || null }),
          ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault }),
          ...(body.isActive === undefined ? {} : { isActive: body.isActive, deletedAt: body.isActive ? null : new Date() }),
        },
      })
    })
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listLocations(true) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '库位编码已存在' }, { status: 409 })
    }
    console.error('Update inventory location error:', error)
    return NextResponse.json({ error: '更新库位失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少库位 ID' }, { status: 400 })
    const existing = await prisma.inventoryLocation.findUnique({
      where: { id }, include: { balances: true },
    })
    if (!existing) return NextResponse.json({ error: '库位不存在' }, { status: 404 })
    if (existing.isDefault) return NextResponse.json({ error: '默认库位不能归档，请先设置其他默认库位' }, { status: 400 })
    const hasStock = existing.balances.some((item) =>
      Math.abs(Number(item.qty)) > 0.000001 || Math.abs(Number(item.reservedQty)) > 0.000001,
    )
    if (hasStock) return NextResponse.json({ error: '该库位仍有库存或占用数量，不能归档' }, { status: 409 })
    const [pendingReceipts, draftReports, pendingShipments, pendingReturns] = await Promise.all([
      prisma.materialIn.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
      prisma.dailyProductionReport.count({ where: { status: 'DRAFT', OR: [{ consumptionLocationId: id }, { outputLocationId: id }] } }),
      prisma.shipment.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
      prisma.returnOrder.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
    ])
    if (pendingReceipts + draftReports + pendingShipments + pendingReturns > 0) {
      return NextResponse.json({ error: '该库位仍被待处理的来料、日报、发货或退货单引用，不能归档' }, { status: 409 })
    }
    const saved = await prisma.inventoryLocation.update({
      where: { id }, data: { isActive: false, deletedAt: new Date() },
    })
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listLocations(true) })
  } catch (error) {
    console.error('Archive inventory location error:', error)
    return NextResponse.json({ error: '归档库位失败' }, { status: 500 })
  }
}
