import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('return', 'update')
    if (denied) return denied

    const returnOrder = await prisma.returnOrder.findUnique({
      where: { id: params.id },
    })

    if (!returnOrder) {
      return NextResponse.json({ error: '退货单不存在' }, { status: 404 })
    }

    if (returnOrder.status !== 'PENDING') {
      return NextResponse.json({ error: '只能拒绝待处理状态的退货单' }, { status: 400 })
    }

    await prisma.returnOrder.update({
      where: { id: params.id },
      data: {
        status: 'REJECTED',
      },
    })

    return NextResponse.json({ success: true, message: '退货已拒绝' })
  } catch (error) {
    console.error('Reject return error:', error)
    return NextResponse.json({ error: '拒绝退货失败' }, { status: 500 })
  }
}
