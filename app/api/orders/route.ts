import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'

const createOrderSchema = z.object({
  productId: z.string().min(1),
  planQty: z.number().int().positive(),
  note: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied

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

        let valuationReserveQty = 0
        if (bomItem.material.stock) {
          const stock = bomItem.material.stock
          const stockQty = Number(stock.qty)
          const stockValuationQty = Number(stock.valuationQty)
          const materialConversionRate = Number(bomItem.material.conversionRate || 1)
          valuationReserveQty = Number((
            requiredQty * (stockQty > 0 ? stockValuationQty / stockQty : materialConversionRate)
          ).toFixed(6))

          await tx.stock.update({
            where: { id: stock.id },
            data: {
              reservedQty: { increment: requiredQty },
              availableQty: { decrement: requiredQty },
              reservedValuationQty: { increment: valuationReserveQty },
              availableValuationQty: { decrement: valuationReserveQty },
            },
          })
        }

        await tx.pickItem.create({
          data: {
            orderId: newOrder.id,
            materialId: bomItem.materialId,
            requiredQty: requiredQty,
            reservedValuationQty: valuationReserveQty,
            actualQty: 0,
            status: stockQty >= requiredQty ? 'PENDING' : 'PENDING',
          },
        })
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
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    applyStatusFilter(where, statuses)

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
