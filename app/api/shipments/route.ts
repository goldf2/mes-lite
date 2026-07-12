import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

const createShipmentSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  customer: z.string().min(1),
  customerPhone: z.string().optional(),
  address: z.string().optional(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  shippedBy: z.string().optional(),
})

// GET: 发货单列表
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const customer = searchParams.get('customer')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    if (status) where.status = status
    if (customer) where.customer = { contains: customer }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.shipment.count({ where }),
    ])

    return NextResponse.json({
      data: shipments,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get shipments error:', error)
    return NextResponse.json({ error: '获取发货单列表失败' }, { status: 500 })
  }
}

// POST: 创建发货单
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = createShipmentSchema.parse(body)

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    })

    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    // 生成 shipmentNo: SH-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.shipment.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const shipmentNo = `SH-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const totalAmount = data.qty * data.unitPrice

    const shipment = await prisma.shipment.create({
      data: {
        shipmentNo,
        productId: data.productId,
        qty: data.qty,
        unitPrice: data.unitPrice,
        totalAmount,
        customer: data.customer,
        customerPhone: data.customerPhone,
        address: data.address,
        trackingNo: data.trackingNo,
        note: data.note,
        shippedBy: data.shippedBy,
        status: 'PENDING',
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'SHIPMENT',
      entityId: shipment.id,
      entityLabel: shipment.shipmentNo,
      afterData: shipment,
    })

    return NextResponse.json({ data: shipment }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create shipment error:', error)
    return NextResponse.json({ error: '创建发货单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少发货单 ID' }, { status: 400 })
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } })
    if (!shipment || shipment.deletedAt) {
      return NextResponse.json({ error: '发货单不存在或已删除' }, { status: 404 })
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'SHIPMENT',
      entityId: updated.id,
      entityLabel: updated.shipmentNo,
      beforeData: shipment,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '发货单已删除，可在回收站恢复' })
  } catch (error) {
    console.error('Delete shipment error:', error)
    return NextResponse.json({ error: '删除发货单失败' }, { status: 500 })
  }
}
