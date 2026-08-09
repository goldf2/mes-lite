import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listProductionOrderOptions } from '@/modules/production/server/production-order-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied

    return NextResponse.json({ data: await listProductionOrderOptions() })
  } catch (error) {
    console.error('Get production order options error:', error)
    return NextResponse.json({ error: '获取生产订单选项失败' }, { status: 500 })
  }
}
