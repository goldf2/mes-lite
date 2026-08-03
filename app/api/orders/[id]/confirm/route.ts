import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      include: { _count: { select: { picks: true } } },
    })

    if (!order) {
      return NextResponse.json({ error: '生产订单不存在' }, { status: 404 })
    }

    if (order.status !== 'DRAFT') {
      return NextResponse.json({ error: '只能确认草稿状态的生产订单' }, { status: 400 })
    }

    const updatedOrder = await prisma.productionOrder.update({
      where: { id: params.id },
      data: {
        status: order._count.picks === 0 ? 'PICKED' : 'CONFIRMED',
        startTime: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: order._count.picks === 0 ? `生产订单 ${updatedOrder.orderNo} 已确认，可直接派工` : `生产订单 ${updatedOrder.orderNo} 已确认`,
      data: updatedOrder,
    })
  } catch (error) {
    console.error('Confirm order error:', error)
    return NextResponse.json({ error: '确认生产订单失败' }, { status: 500 })
  }
}
