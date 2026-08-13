import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { shipManagedShipment } from '@/modules/sales/server/fulfillment-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    await shipManagedShipment(params.id, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    return NextResponse.json({ success: true, message: '发货成功' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Ship shipment error:', error)
    return NextResponse.json({ error: '确认发货失败' }, { status: 500 })
  }
}
