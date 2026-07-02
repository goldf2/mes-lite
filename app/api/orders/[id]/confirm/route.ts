import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    if (order.status !== 'DRAFT') {
      return NextResponse.json({ error: '只能确认草稿状态的工单' }, { status: 400 })
    }

    const updatedOrder = await prisma.productionOrder.update({
      where: { id: params.id },
      data: {
        status: 'CONFIRMED',
        startTime: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `工单 ${updatedOrder.orderNo} 已确认`,
      data: updatedOrder,
    })
  } catch (error) {
    console.error('Confirm order error:', error)
    return NextResponse.json({ error: '确认工单失败' }, { status: 500 })
  }
}
