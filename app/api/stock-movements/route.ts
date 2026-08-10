import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStockMovementQuery } from '@/modules/inventory/contracts/stock-movement-route'
import { loadStockMovementWorkspace } from '@/modules/inventory/server/stock-movement-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    return NextResponse.json(await loadStockMovementWorkspace(parseStockMovementQuery(req.nextUrl.searchParams)))
  } catch (error) {
    console.error('Get stock movements error:', error)
    return NextResponse.json({ error: '获取库存流水失败' }, { status: 500 })
  }
}
