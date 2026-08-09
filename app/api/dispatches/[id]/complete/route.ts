import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { DispatchDomainError } from '@/modules/production/domain/dispatch-errors'
import { transitionManagedDispatch } from '@/modules/production/server/dispatch-status-service'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('dispatch', 'update')
    if (denied) return denied
    const { updated } = await transitionManagedDispatch(params.id, 'complete')
    return NextResponse.json({ success: true, message: `派工单 ${updated.dispatchNo} 已完成`, data: updated })
  } catch (error) {
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Complete dispatch error:', error)
    return NextResponse.json({ error: '完成派工失败' }, { status: 500 })
  }
}
