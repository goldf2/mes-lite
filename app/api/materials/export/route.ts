import { NextRequest, NextResponse } from 'next/server'
import { csvResponse } from '@/lib/csv'
import { requireResourcePermission } from '@/lib/permissions'
import { exportMaterialsCsv } from '@/modules/materials/server/material-export-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    if (params.get('bomStatus')) {
      const bomDenied = await requireResourcePermission('bom', 'read')
      if (bomDenied) return bomDenied
    }
    return csvResponse('materials-export.csv', await exportMaterialsCsv({
      keyword: params.get('keyword'), category: params.get('category'), categories: params.get('categories'),
      customerId: params.get('customerId'), bomStatus: params.get('bomStatus'),
      sortBy: params.get('sortBy'), sortDir: params.get('sortDir'),
    }))
  } catch (error) {
    console.error('Export materials error:', error)
    return NextResponse.json({ error: '导出物料失败' }, { status: 500 })
  }
}
