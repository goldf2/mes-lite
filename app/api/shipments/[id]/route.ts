import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

// GET: 发货单详情
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied

    const shipment = await prisma.shipment.findUnique({
      where: { id: params.id },
      include: {
        product: true,
        returnOrders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: shipment })
  } catch (error) {
    console.error('Get shipment detail error:', error)
    return NextResponse.json({ error: '获取发货单详情失败' }, { status: 500 })
  }
}
