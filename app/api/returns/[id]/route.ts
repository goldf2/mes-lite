import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { getReturnDetail } from '@/modules/sales/server/fulfillment-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await getReturnDetail(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get return detail error:', error)
    return NextResponse.json({ error: '获取退货单详情失败' }, { status: 500 })
  }
}
