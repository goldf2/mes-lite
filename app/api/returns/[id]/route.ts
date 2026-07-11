import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied

    const returnOrder = await prisma.returnOrder.findUnique({
      where: { id: params.id },
      include: {
        product: true,
        shipment: true,
      },
    })

    if (!returnOrder) {
      return NextResponse.json({ error: '退货单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: returnOrder })
  } catch (error) {
    console.error('Get return detail error:', error)
    return NextResponse.json({ error: '获取退货单详情失败' }, { status: 500 })
  }
}
