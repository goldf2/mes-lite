import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { confirmProductionOrder } from '@/modules/production/server/production-order-status-service'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const { previous, updated, message } = await confirmProductionOrder(params.id)
    await writeAuditLog(req, {
      action: 'RELEASE',
      entityType: 'ORDER',
      entityId: updated.id,
      entityLabel: updated.orderNo,
      beforeData: previous,
      afterData: updated,
      note: '发布生产订单，允许派工和登记班后生产实绩',
    })

    return NextResponse.json({
      success: true,
      message,
      data: updated,
    })
  } catch (error) {
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Confirm order error:', error)
    return NextResponse.json({ error: '确认生产订单失败' }, { status: 500 })
  }
}
