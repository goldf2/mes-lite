import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listShippableSalesOrderItems } from '@/modules/sales/server/sales-order-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json(await listShippableSalesOrderItems(await loadEffectiveDataScope(operator)))
  } catch (error) {
    console.error('Get shippable sales order items error:', error)
    return NextResponse.json({ error: '获取待发销售明细失败' }, { status: 500 })
  }
}
