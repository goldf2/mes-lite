import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { reverseProductionOrderActualSchema } from '@/modules/production/contracts/production-order-actual-schema'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { reverseProductionOrderActual } from '@/modules/production/server/production-order-actual-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; actualId: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied
    const input = reverseProductionOrderActualSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await reverseProductionOrderActual(params.id, params.actualId, input, operatorDisplayName(operator))
    await writeAuditLog(req, {
      action: 'REVERSE', entityType: 'PRODUCTION_ORDER_ACTUAL', entityId: result.updated.id,
      entityLabel: result.updated.actualNo, beforeData: result.before, afterData: result.updated, note: input.reason,
    })
    return NextResponse.json({ data: result.updated, message: '班后生产实绩已冲销，投入与全部产出库存已反向恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '冲销班后生产实绩失败' }, { status: 500 })
  }
}
