import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { cancelProductionOrderSchema } from '@/modules/production/contracts/production-order-schema'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { cancelProductionOrder } from '@/modules/production/server/production-order-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied
    const result = await cancelProductionOrder(params.id, cancelProductionOrderSchema.parse(await req.json()))
    return NextResponse.json({ success: true, message: `工单 ${result.orderNo} 已取消，物料已退库` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Cancel order error:', error)
    return NextResponse.json({ error: '取消工单失败' }, { status: 500 })
  }
}
