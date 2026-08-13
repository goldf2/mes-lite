import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import type { QualityTaskFilter } from '@/modules/quality/contracts/quality-task'
import { listQualityTaskWorkspace } from '@/modules/quality/server/quality-task-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('quality', 'read')
  if (denied) return denied
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
  const requested = req.nextUrl.searchParams.get('filter') || 'PENDING'
  const filter: QualityTaskFilter = requested === 'DISPOSITION' || requested === 'ALL' ? requested : 'PENDING'
  return NextResponse.json(await listQualityTaskWorkspace({
    filter,
    keyword: req.nextUrl.searchParams.get('keyword') || '',
  }, await loadEffectiveDataScope(operator)))
}
