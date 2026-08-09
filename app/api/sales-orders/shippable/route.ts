import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listShippableSalesOrderItems } from '@/modules/sales/server/sales-order-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied
    return NextResponse.json(await listShippableSalesOrderItems())
  } catch (error) {
    console.error('Get shippable sales order items error:', error)
    return NextResponse.json({ error: '获取待发销售明细失败' }, { status: 500 })
  }
}
