import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { confirmManagedSalesOrder } from '@/modules/sales/server/sales-order-command-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'update')
    if (denied) return denied
    const { before, updated } = await confirmManagedSalesOrder(params.id)
    await writeAuditLog(req, {
      action: 'CONFIRM', entityType: 'SALES_ORDER', entityId: before.id,
      entityLabel: before.orderNo, beforeData: before, afterData: updated,
    })
    return NextResponse.json({ data: updated, message: '销售订单已确认' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Confirm sales order error:', error)
    return NextResponse.json({ error: '确认销售订单失败' }, { status: 500 })
  }
}
