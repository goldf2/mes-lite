import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getMaterialPanorama, MaterialPanoramaNotFoundError } from '@/modules/materials/server/material-panorama-query-service'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getMaterialPanorama(params.id) })
  } catch (error) {
    if (error instanceof MaterialPanoramaNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Get material panorama error:', error)
    return NextResponse.json({ error: '获取物料全景失败' }, { status: 500 })
  }
}
