import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getInventoryLotPanorama } from '@/modules/inventory'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getInventoryLotPanorama(params.id) })
  } catch (error) {
    if (error instanceof Error && error.message === '内部批次不存在') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Get inventory lot panorama error:', error)
    return NextResponse.json({ error: '获取批次追溯全景失败' }, { status: 500 })
  }
}
