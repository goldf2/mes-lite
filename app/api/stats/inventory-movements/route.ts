import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { loadEffectiveDataScope } from '@/modules/identity-access'
import { getStockMovementStats } from '@/modules/inventory/server/stock-movement-stats-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const params = req.nextUrl.searchParams
    return NextResponse.json({ data: await getStockMovementStats({
      startDate: params.get('startDate'), endDate: params.get('endDate'), materialId: params.get('materialId'), locationId: params.get('locationId'),
    }, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    console.error('Get inventory movement stats error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '获取数量变动统计失败' }, { status: 400 })
  }
}
