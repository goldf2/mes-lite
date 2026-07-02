import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createOrderSchema = z.object({
  productId: z.string().min(1),
  planQty: z.number().int().positive(),
  note: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { productId, planQty, note } = createOrderSchema.parse(body)

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        bom: true,
        processRoutes: { where: { isDefault: true }, include: { steps: true } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    if (!product.bom || product.processRoutes.length === 0) {
      return NextResponse.json({ error: '产品缺少 BOM 或工艺路线' }, { status: 400 })
    }

    const route = product.processRoutes[0]

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.productionOrder.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const orderNo = `WO-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const bomWithItems = await prisma.bOM.findUnique({
      where: { id: product.bom.id },
      include: { items: { include: { material: { include: { stock: true } } } } },
    })

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.productionOrder.create({
        data: {
          orderNo,
          productId,
          planQty,
          status: 'DRAFT',
          note,
        },
      })

      for (const bomItem of bomWithItems!.items) {
        const requiredQty = Number(bomItem.quantity) * planQty * (1 + Number(bomItem.wastageRate) / 100)
        const stockQty = Number(bomItem.material.stock?.availableQty ?? 0)

        await tx.pickItem.create({
          data: {
            orderId: newOrder.id,
            materialId: bomItem.materialId,
            requiredQty: requiredQty,
            actualQty: 0,
            status: stockQty >= requiredQty ? 'PENDING' : 'PENDING',
          },
        })

        if (bomItem.material.stock) {
          await tx.stock.update({
            where: { id: bomItem.material.stock.id },
            data: {
              reservedQty: { increment: requiredQty },
              availableQty: { decrement: requiredQty },
            },
          })
        }
      }

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
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where = status ? { status: status as any } : {}

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
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
