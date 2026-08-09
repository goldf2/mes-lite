import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getSalesOrderOptions } from '@/modules/sales/server/sales-order-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('salesOrder', 'read')
    if (denied) return denied
    return NextResponse.json(await getSalesOrderOptions())
  } catch (error) {
    console.error('Get sales order options error:', error)
    return NextResponse.json({ error: '获取销售订单选项失败' }, { status: 500 })
  }
}
