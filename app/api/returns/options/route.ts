import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listReturnShipmentOptions } from '@/modules/sales/server/fulfillment-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await listReturnShipmentOptions(await loadEffectiveDataScope(operator)) })
  } catch (error) {
    console.error('Get return shipment options error:', error)
    return NextResponse.json({ error: '获取可退发货单失败' }, { status: 500 })
  }
}
