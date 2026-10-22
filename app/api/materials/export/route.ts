import { NextRequest, NextResponse } from 'next/server'
import { csvResponse } from '@/lib/csv'
import { requireResourcePermission } from '@/lib/permissions'
import { parseMaterialListQuery, materialQueryNeedsBomPermission } from '@/modules/materials/contracts/material-schema'
import { exportMaterialsCsv, MaterialExportError } from '@/modules/materials/server/material-export-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    const parsed = parseMaterialListQuery(params)
    if (!parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (materialQueryNeedsBomPermission(parsed.data)) {
      const bomDenied = await requireResourcePermission('bom', 'read')
      if (bomDenied) return bomDenied
    }
    return csvResponse('materials-export.csv', await exportMaterialsCsv({
      keyword: params.get('keyword'), category: params.get('category'), categories: params.get('categories'),
      customerId: params.get('customerId'), bomStatus: params.get('bomStatus'),
      sortBy: params.get('sortBy'), sortDir: params.get('sortDir'), advanced: params.get('advanced'),
    }))
  } catch (error) {
    if (error instanceof MaterialExportError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Export materials error:', error)
    return NextResponse.json({ error: '导出物料失败' }, { status: 500 })
  }
}
