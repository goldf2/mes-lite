import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { confirmProductionOrder } from '@/modules/production/server/production-order-status-service'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const { updated, message } = await confirmProductionOrder(params.id)

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
