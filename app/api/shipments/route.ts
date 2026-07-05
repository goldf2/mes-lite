import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

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
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const customer = searchParams.get('customer')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = {}
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

    return NextResponse.json({ data: shipment }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create shipment error:', error)
    return NextResponse.json({ error: '创建发货单失败' }, { status: 500 })
  }
}
