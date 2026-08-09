import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getQualityStatistics } from '@/modules/production/server/production-statistics-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    return NextResponse.json({ data: await getQualityStatistics({
      startDate: params.get('startDate'), endDate: params.get('endDate'),
    }) })
  } catch (error) {
    console.error('Get quality stats error:', error)
    return NextResponse.json({ error: '获取质量统计失败' }, { status: 500 })
  }
}
