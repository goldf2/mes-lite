import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import type { MaterialImportMode } from '@/modules/materials/contracts/material-import'
import { importMaterialsCsv, MaterialImportError } from '@/modules/materials/server/material-import-service'

export async function POST(req: NextRequest) {
  try {
    const createDenied = await requireResourcePermission('materials', 'create')
    if (createDenied) return createDenied
    const mode: MaterialImportMode = new URL(req.url).searchParams.get('mode') === 'update' ? 'update' : 'skip'
    if (mode === 'update') {
      const updateDenied = await requireResourcePermission('materials', 'update')
      if (updateDenied) return updateDenied
    }
    const file = (await req.formData()).get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: '请上传 CSV 文件' }, { status: 400 })
    if (file.size > 1024 * 1024) return NextResponse.json({ error: 'CSV 文件不能超过 1MB' }, { status: 400 })

    const summary = await importMaterialsCsv(await file.text(), mode)
    await writeAuditLog(req, {
      action: mode === 'update' ? 'IMPORT_UPSERT' : 'IMPORT_CREATE',
      entityType: 'MATERIAL',
      entityLabel: '物料批量导入',
      afterData: summary,
      note: `文件：${file.name}`,
    })
    return NextResponse.json({ data: summary })
  } catch (error) {
    if (error instanceof MaterialImportError) {
      return NextResponse.json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: 400 })
    }
    console.error('Import materials error:', error)
    return NextResponse.json({ error: '导入物料失败' }, { status: 500 })
  }
}
