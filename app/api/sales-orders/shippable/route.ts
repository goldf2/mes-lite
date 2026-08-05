import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied

    const items = await prisma.salesOrderItem.findMany({
      where: {
        salesOrder: { is: { status: { in: ['CONFIRMED', 'PARTIAL'] }, deletedAt: null } },
        material: { is: { deletedAt: null } },
      },
      include: {
        salesOrder: {
          include: { customer: { select: { id: true, code: true, name: true, phone: true, address: true } } },
        },
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            spec: true,
            category: true,
            stockUnit: true,
            unit: true,
            stock: {
              select: {
                availableQty: true,
                locationBalances: {
                  select: { locationId: true, availableQty: true },
                },
              },
            },
          },
        },
        shipments: { where: { status: 'PENDING', deletedAt: null }, select: { qty: true } },
      },
      orderBy: { salesOrder: { orderDate: 'desc' } },
    })

    const data = items.flatMap((item) => {
      const pendingQty = item.shipments.reduce((sum, shipment) => sum + Number(shipment.qty), 0)
      const remainingQty = Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))
      if (remainingQty <= 0) return []
      const { shipments, ...rest } = item
      return [{ ...rest, pendingQty, remainingQty }]
    })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Get shippable sales order items error:', error)
    return NextResponse.json({ error: '获取待发销售明细失败' }, { status: 500 })
  }
}
