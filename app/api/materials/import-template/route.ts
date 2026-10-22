import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { csvResponse } from '@/lib/csv'
import { materialImportTemplateCsv } from '@/modules/materials/domain/material-import-fields'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    return csvResponse('material-import-template.csv', materialImportTemplateCsv())
  } catch (error) {
    console.error('Download material import template error:', error)
    return NextResponse.json({ error: '下载物料导入模板失败' }, { status: 500 })
  }
}
