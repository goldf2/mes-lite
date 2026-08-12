import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { searchInventoryLots } from '@/modules/inventory'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    return NextResponse.json({ data: await searchInventoryLots({ keyword: searchParams.get('keyword') || '' }) })
  } catch (error) {
    console.error('Search inventory lots error:', error)
    return NextResponse.json({ error: '搜索批次失败' }, { status: 500 })
  }
}
