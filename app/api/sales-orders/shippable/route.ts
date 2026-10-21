import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getShipmentCreateOptions } from '@/modules/sales/server/sales-order-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const editingDraft = new URL(req.url).searchParams.get('context') === 'shipment-draft'
    const denied = editingDraft
      ? await requireResourcePermission('shipment', 'update')
      : await requireResourcePermission('shipment', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json(await getShipmentCreateOptions(await loadEffectiveDataScope(operator)))
  } catch (error) {
    console.error('Get shipment create options error:', error)
    return NextResponse.json({ error: '获取发货建单选项失败' }, { status: 500 })
  }
}
