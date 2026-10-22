import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { importMaterialsCsv } from '@/modules/materials/server/material-import-service'
import { readMaterialImportUpload, materialImportErrorResponse } from '@/modules/materials/server/material-import-http'

export async function POST(req: NextRequest) {
  try {
    const readDenied = await requireResourcePermission('materials', 'read')
    if (readDenied) return readDenied
    const createDenied = await requireResourcePermission('materials', 'create')
    if (createDenied) return createDenied
    const upload = await readMaterialImportUpload(req)
    if (upload.options.mode === 'update') {
      const updateDenied = await requireResourcePermission('materials', 'update')
      if (updateDenied) return updateDenied
    }
    const summary = await importMaterialsCsv(upload, upload.options.mode, await getAuditContext(req))
    return NextResponse.json({ data: summary })
  } catch (error) { return materialImportErrorResponse(error) }
}
