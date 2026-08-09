import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { listProductCompatibleMaterials } from '@/modules/materials/server/product-compatible-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listProductCompatibleMaterials(req.nextUrl.searchParams.get('customerId')) })
  } catch (error) {
    console.error('Get product-compatible materials error:', error)
    return NextResponse.json({ error: '获取物料列表失败' }, { status: 500 })
  }
}
