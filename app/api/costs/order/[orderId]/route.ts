import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listProductionOrderCosts } from '@/modules/production/server/production-cost-record-query-service'

export async function GET(_: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied
    return NextResponse.json(await listProductionOrderCosts(params.orderId))
  } catch (error) {
    console.error('Get order costs error:', error)
    return NextResponse.json({ error: '获取工单成本明细失败' }, { status: 500 })
  }
}
