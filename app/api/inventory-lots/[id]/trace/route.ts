import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getInventoryLotTrace } from '@/modules/inventory'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await getInventoryLotTrace(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error && error.message === '内部批次不存在') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Get inventory lot trace error:', error)
    return NextResponse.json({ error: '获取批次谱系失败' }, { status: 500 })
  }
}
