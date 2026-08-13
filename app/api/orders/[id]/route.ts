import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getProductionOrderDetail } from '@/modules/production/server/production-order-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { assertProductionOrderIdDataScope, DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const scope = await loadEffectiveDataScope(operator)
    await assertProductionOrderIdDataScope(scope, params.id)
    const order = await getProductionOrderDetail(params.id, scope)

    if (!order) {
      return NextResponse.json({ error: '生产订单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: order })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get order detail error:', error)
    return NextResponse.json({ error: '获取生产订单详情失败' }, { status: 500 })
  }
}
