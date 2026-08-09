import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { deliverManagedShipment } from '@/modules/sales/server/fulfillment-status-service'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    await deliverManagedShipment(params.id)
    return NextResponse.json({ success: true, message: '签收成功' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Deliver shipment error:', error)
    return NextResponse.json({ error: '确认签收失败' }, { status: 500 })
  }
}
