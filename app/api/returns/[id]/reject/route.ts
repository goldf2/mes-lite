import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { rejectManagedReturn } from '@/modules/sales/server/fulfillment-status-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('return', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    await rejectManagedReturn(params.id, await loadEffectiveDataScope(operator))
    return NextResponse.json({ success: true, message: '退货已拒绝' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reject return error:', error)
    return NextResponse.json({ error: '拒绝退货失败' }, { status: 500 })
  }
}
