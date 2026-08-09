import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { DispatchDomainError } from '@/modules/production/domain/dispatch-errors'
import { transitionManagedDispatch } from '@/modules/production/server/dispatch-status-service'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('dispatch', 'update')
    if (denied) return denied
    const { updated } = await transitionManagedDispatch(params.id, 'start')
    return NextResponse.json({ success: true, message: `派工单 ${updated.dispatchNo} 已开始生产`, data: updated })
  } catch (error) {
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Start dispatch error:', error)
    return NextResponse.json({ error: '开始生产失败' }, { status: 500 })
  }
}
