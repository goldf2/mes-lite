import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { loadMaterialInConversionHistory } from '@/modules/receiving/server/material-in-conversion-history-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied
    const materialId = new URL(req.url).searchParams.get('materialId')
    if (!materialId) return NextResponse.json({ error: '缺少物料 ID' }, { status: 400 })
    return NextResponse.json({ data: await loadMaterialInConversionHistory(materialId) })
  } catch (error) {
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get material-in conversion history error:', error)
    return NextResponse.json({ error: '获取物料历史换算失败' }, { status: 500 })
  }
}
