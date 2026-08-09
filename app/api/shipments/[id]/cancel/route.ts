import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { cancelManagedShipment } from '@/modules/sales/server/fulfillment-status-service'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    await cancelManagedShipment(params.id)
    return NextResponse.json({ success: true, message: '发货单已取消' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Cancel shipment error:', error)
    return NextResponse.json({ error: '取消发货失败' }, { status: 500 })
  }
}
