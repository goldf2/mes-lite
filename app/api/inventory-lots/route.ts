import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { searchInventoryLots } from '@/modules/inventory'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { searchParams } = new URL(req.url)
    return NextResponse.json({
      data: await searchInventoryLots(
        { keyword: searchParams.get('keyword') || '' },
        await loadEffectiveDataScope(operator),
      ),
    })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Search inventory lots error:', error)
    return NextResponse.json({ error: '搜索批次失败' }, { status: 500 })
  }
}
