import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getProductionStatistics } from '@/modules/production/server/production-statistics-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    return NextResponse.json({ data: await getProductionStatistics({
      startDate: params.get('startDate'), endDate: params.get('endDate'), groupBy: params.get('groupBy') || 'product',
    }) })
  } catch (error) {
    console.error('Get production stats error:', error)
    return NextResponse.json({ error: '获取产量统计失败' }, { status: 500 })
  }
}
