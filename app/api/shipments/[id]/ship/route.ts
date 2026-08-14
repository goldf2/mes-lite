import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { shipManagedShipment } from '@/modules/sales/server/fulfillment-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipmentDispatch', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { before, updated } = await shipManagedShipment(params.id, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'SHIP', entityType: 'SHIPMENT', entityId: updated.id,
      entityLabel: updated.shipmentNo, beforeData: before, afterData: updated,
      note: '发货库存、成本层与批次分配已过账',
    })
    return NextResponse.json({ success: true, message: '发货成功' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Ship shipment error:', error)
    return NextResponse.json({ error: '确认发货失败' }, { status: 500 })
  }
}
