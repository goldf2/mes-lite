import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { previewMaterialImport } from '@/modules/materials/server/material-import-service'
import { readMaterialImportUpload, materialImportErrorResponse } from '@/modules/materials/server/material-import-http'

export async function POST(req: NextRequest) {
  // audit-exempt: 只读解析文件、匹配目标物料并返回预览，不写入业务资料或库存。
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
    return NextResponse.json({ data: await previewMaterialImport(upload) })
  } catch (error) { return materialImportErrorResponse(error) }
}
