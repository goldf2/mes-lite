import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getProductionOrderDetail } from '@/modules/production/server/production-order-query-service'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    const order = await getProductionOrderDetail(params.id)

    if (!order) {
      return NextResponse.json({ error: '生产订单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: order })
  } catch (error) {
    console.error('Get order detail error:', error)
    return NextResponse.json({ error: '获取生产订单详情失败' }, { status: 500 })
  }
}
