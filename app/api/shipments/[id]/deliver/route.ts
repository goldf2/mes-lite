import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { deliverManagedShipment } from '@/modules/sales/server/fulfillment-status-service'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipmentDeliver', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { before, updated } = await deliverManagedShipment(params.id, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'DELIVER', entityType: 'SHIPMENT', entityId: updated.id,
      entityLabel: updated.shipmentNo, beforeData: before, afterData: updated,
      note: '客户签收已确认',
    })
    return NextResponse.json({ success: true, message: '签收成功' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Deliver shipment error:', error)
    return NextResponse.json({ error: '确认签收失败' }, { status: 500 })
  }
}
