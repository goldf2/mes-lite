import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { createProductionOrderActualSchema } from '@/modules/production/contracts/production-order-actual-schema'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { productionOrderHttpError } from '@/modules/production/http/production-order-http'
import { createProductionOrderActual, getProductionOrderActualWorkspace } from '@/modules/production/server/production-order-actual-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await getProductionOrderActualWorkspace(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    return productionOrderHttpError(error, '获取生产订单实绩失败')
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('productionActualEntry', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const actual = await createProductionOrderActual(params.id, createProductionOrderActualSchema.parse(await req.json()), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'PRODUCTION_ORDER_ACTUAL',
      entityId: actual.id,
      entityLabel: actual.actualNo,
      afterData: actual,
      note: '保存班后生产实绩草稿及订单 BOM 快照换算结果',
    })
    return NextResponse.json({ data: actual, message: '班后生产实绩草稿已保存' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '保存班后生产实绩失败' }, { status: 500 })
  }
}
