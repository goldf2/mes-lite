import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { DispatchDomainError } from '@/modules/production/domain/dispatch-errors'
import { getManagedDispatch } from '@/modules/production/server/dispatch-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('dispatch', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await getManagedDispatch(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get dispatch detail error:', error)
    return NextResponse.json({ error: '获取派工单详情失败' }, { status: 500 })
  }
}
