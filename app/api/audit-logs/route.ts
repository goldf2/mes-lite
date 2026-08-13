import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listAuditLogs } from '@/modules/operations-tools/server/maintenance-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('auditLogs', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    return NextResponse.json(await listAuditLogs({
      entityType: params.get('entityType'), entityId: params.get('entityId'),
      page: Math.max(1, Number(params.get('page') ?? '1')),
      pageSize: Math.max(1, Number(params.get('pageSize') ?? '50')),
    }))
  } catch (error) {
    console.error('Get audit logs error:', error)
    return NextResponse.json({ error: '获取操作记录失败' }, { status: 500 })
  }
}
