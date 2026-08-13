import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { confirmProductionOrderActualSchema } from '@/modules/production/contracts/production-order-actual-schema'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { confirmProductionOrderActual } from '@/modules/production/server/production-order-actual-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; actualId: string } }) {
  try {
    const denied = await requireResourcePermission('productionActualConfirm', 'update')
    if (denied) return denied
    confirmProductionOrderActualSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await confirmProductionOrderActual(params.id, params.actualId, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CONFIRM', entityType: 'PRODUCTION_ORDER_ACTUAL', entityId: result.updated.id,
      entityLabel: result.updated.actualNo, beforeData: result.before, afterData: result.updated,
      note: '确认班后生产实绩并原子更新投入、全部产出和生产订单累计数量',
    })
    return NextResponse.json({ data: result.updated, message: '班后生产实绩已确认，投入和全部产出库存已同步更新' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '确认班后生产实绩失败' }, { status: 500 })
  }
}
