import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import type { QualityTaskFilter } from '@/modules/quality/contracts/quality-task'
import { listQualityTaskWorkspace } from '@/modules/quality/server/quality-task-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('quality', 'read')
  if (denied) return denied
  const requested = req.nextUrl.searchParams.get('filter') || 'PENDING'
  const filter: QualityTaskFilter = requested === 'DISPOSITION' || requested === 'ALL' ? requested : 'PENDING'
  return NextResponse.json(await listQualityTaskWorkspace({
    filter,
    keyword: req.nextUrl.searchParams.get('keyword') || '',
  }))
}
