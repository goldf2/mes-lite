import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getInventoryLotTrace } from '@/modules/inventory'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getInventoryLotTrace(params.id) })
  } catch (error) {
    if (error instanceof Error && error.message === '内部批次不存在') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Get inventory lot trace error:', error)
    return NextResponse.json({ error: '获取批次谱系失败' }, { status: 500 })
  }
}
