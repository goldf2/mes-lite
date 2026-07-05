import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH: 确认签收
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: params.id },
    })

    if (!shipment) {
      return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
    }

    if (shipment.status !== 'SHIPPED') {
      return NextResponse.json(
        { error: '只能确认已发货状态的发货单签收' },
        { status: 400 }
      )
    }

    await prisma.shipment.update({
      where: { id: params.id },
      data: {
        status: 'DELIVERED',
      },
    })

    return NextResponse.json({ success: true, message: '签收成功' })
  } catch (error) {
    console.error('Deliver shipment error:', error)
    return NextResponse.json({ error: '确认签收失败' }, { status: 500 })
  }
}
