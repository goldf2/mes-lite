import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { summarizeProductionCosts } from '@/modules/production/server/production-cost-record-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await summarizeProductionCosts({
      startDate: req.nextUrl.searchParams.get('startDate'),
      endDate: req.nextUrl.searchParams.get('endDate'),
    }) })
  } catch (error) {
    console.error('Get cost stats error:', error)
    return NextResponse.json({ error: '获取成本统计失败' }, { status: 500 })
  }
}
