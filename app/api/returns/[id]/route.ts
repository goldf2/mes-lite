import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { getReturnDetail } from '@/modules/sales/server/fulfillment-query-service'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getReturnDetail(params.id) })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get return detail error:', error)
    return NextResponse.json({ error: '获取退货单详情失败' }, { status: 500 })
  }
}
