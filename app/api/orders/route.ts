import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'
import { ensureProductForMaterial, isMaterialProductId, materialProductPrefix } from '@/lib/material-product'

const createOrderSchema = z.object({
  voucherNo: z.string().optional(),
  targetType: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  targetId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  materialId: z.string().min(1).optional(),
  planQty: z.number().int().positive(),
  note: z.string().optional(),
})

async function ensureSimpleProductForMaterial(material: { code: string; name: string; category: string; customerId?: string | null; stockUnit: string; unit: string }) {
  return ensureProductForMaterial(prisma, material, { defaultRoute: true, description: `由物料 ${material.code} 自动映射，用于简易生产工单。` })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied

    const body = await req.json()
    const parsed = createOrderSchema.parse(body)
    const rawTargetId = parsed.targetId ?? parsed.materialId ?? parsed.productId
    const targetId = isMaterialProductId(rawTargetId) ? rawTargetId?.slice(materialProductPrefix.length) : rawTargetId
    const { planQty, note, voucherNo } = parsed

    if (!targetId) {
      return NextResponse.json({ error: '请选择物料' }, { status: 400 })
    }

    let productId = ''
    let materialId: string | null = null
    const material = await prisma.material.findUnique({
      where: { id: targetId },
      select: { id: true, code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true, deletedAt: true },
    })

    if (!material || material.deletedAt) {
      return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })
    }

    materialId = material.id
    productId = await ensureSimpleProductForMaterial(material)

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.productionOrder.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const orderNo = `WO-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.productionOrder.create({
        data: {
          orderNo,
          voucherNo: voucherNo?.trim() || null,
          productId,
          materialId,
          planQty,
          status: 'DRAFT',
          note,
        },
      })

      return newOrder
    })

    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create order error:', error)
    return NextResponse.json({ error: '创建工单失败' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const keyword = searchParams.get('keyword')?.trim()
    const customerId = searchParams.get('customerId')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    const andConditions: any[] = []
    applyStatusFilter(where, statuses)
    if (customerId === '__UNASSIGNED__') {
      andConditions.push({ OR: [
        { product: { is: { customerId: null } } },
        { targetMaterial: { is: { customerId: null } } },
      ] })
    } else if (customerId) {
      andConditions.push({ OR: [
        { product: { is: { customerId } } },
        { targetMaterial: { is: { customerId } } },
      ] })
    }
    if (keyword) {
      andConditions.push({ OR: [
        { orderNo: { contains: keyword } },
        { voucherNo: { contains: keyword } },
        { product: { is: { sku: { contains: keyword } } } },
        { product: { is: { name: { contains: keyword } } } },
        { targetMaterial: { is: { code: { contains: keyword } } } },
        { targetMaterial: { is: { name: { contains: keyword } } } },
        { targetMaterial: { is: { spec: { contains: keyword } } } },
      ] })
    }
    if (andConditions.length > 0) where.AND = andConditions

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
          targetMaterial: { select: { id: true, name: true, code: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, valuationUnit: true } },
          _count: { select: { reports: true, picks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productionOrder.count({ where }),
    ])

    return NextResponse.json({
      data: orders,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: '获取工单列表失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少工单 ID' }, { status: 400 })

    const order = await prisma.productionOrder.findUnique({ where: { id } })
    if (!order || order.deletedAt) {
      return NextResponse.json({ error: '工单不存在或已归档' }, { status: 404 })
    }

    const updated = await prisma.productionOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'ORDER',
      entityId: updated.id,
      entityLabel: updated.orderNo,
      beforeData: order,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '工单已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive order error:', error)
    return NextResponse.json({ error: '归档工单失败' }, { status: 500 })
  }
}
