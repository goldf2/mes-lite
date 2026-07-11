import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'

const createReturnSchema = z.object({
  shipmentId: z.string().min(1).optional(),
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  reason: z.string().min(1, '退货原因必填'),
  note: z.string().optional(),
})

// POST: 创建退货单
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'create')
    if (denied) return denied

    const body = await req.json()
    const { shipmentId, productId, qty, reason, note } = createReturnSchema.parse(body)

    const product = await prisma.product.findUnique({
      where: { id: productId },
    })

    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    if (shipmentId) {
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      })
      if (!shipment) {
        return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
      }
    }

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.returnOrder.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const returnNo = `RT-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const returnOrder = await prisma.returnOrder.create({
      data: {
        returnNo,
        shipmentId: shipmentId ?? null,
        productId,
        qty,
        reason,
        note,
        status: 'PENDING',
      },
      include: {
        product: true,
        shipment: true,
      },
    })

    return NextResponse.json({ data: returnOrder }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create return error:', error)
    return NextResponse.json({ error: '创建退货单失败' }, { status: 500 })
  }
}

// GET: 退货单列表
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where = status ? { status: status as any } : {}

    const [returns, total] = await Promise.all([
      prisma.returnOrder.findMany({
        where,
        include: {
          product: true,
          shipment: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.returnOrder.count({ where }),
    ])

    return NextResponse.json({
      data: returns,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get returns error:', error)
    return NextResponse.json({ error: '获取退货单列表失败' }, { status: 500 })
  }
}
