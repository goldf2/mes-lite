import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { cancelManagedShipment } from '@/modules/sales/server/fulfillment-status-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    await cancelManagedShipment(params.id, await loadEffectiveDataScope(operator))
    return NextResponse.json({ success: true, message: '发货单已取消' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Cancel shipment error:', error)
    return NextResponse.json({ error: '取消发货失败' }, { status: 500 })
  }
}
