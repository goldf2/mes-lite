import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listReturnShipmentOptions } from '@/modules/sales/server/fulfillment-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listReturnShipmentOptions() })
  } catch (error) {
    console.error('Get return shipment options error:', error)
    return NextResponse.json({ error: '获取可退发货单失败' }, { status: 500 })
  }
}
