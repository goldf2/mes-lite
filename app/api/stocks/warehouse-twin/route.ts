import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { queryWarehouseDigitalTwin } from '@/modules/inventory/server/warehouse-digital-twin-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await queryWarehouseDigitalTwin(await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get warehouse digital twin error:', error)
    return NextResponse.json({ error: '获取仓库数字孪生失败' }, { status: 500 })
  }
}
