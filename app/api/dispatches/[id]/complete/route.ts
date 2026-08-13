import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { DispatchDomainError } from '@/modules/production/domain/dispatch-errors'
import { transitionManagedDispatch } from '@/modules/production/server/dispatch-status-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('dispatch', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { updated } = await transitionManagedDispatch(params.id, 'complete', new Date(), await loadEffectiveDataScope(operator))
    return NextResponse.json({ success: true, message: `派工单 ${updated.dispatchNo} 已完成`, data: updated })
  } catch (error) {
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Complete dispatch error:', error)
    return NextResponse.json({ error: '完成派工失败' }, { status: 500 })
  }
}
