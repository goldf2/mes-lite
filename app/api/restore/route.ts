import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { archiveModelSchema } from '@/modules/operations-tools/contracts/maintenance'
import { ArchivedRecordRestoreError, restoreArchivedRecord } from '@/modules/operations-tools/server/archived-record-restore-service'

const restoreSchema = z.object({ model: archiveModelSchema, id: z.string().min(1) })

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('archive', 'update')
    if (denied) return denied
    const { model, id } = restoreSchema.parse(await req.json())
    const result = await restoreArchivedRecord(model, id)
    await writeAuditLog(req, {
      action: 'RESTORE', entityType: result.entityType, entityId: result.restored.id,
      entityLabel: result.entityLabel, beforeData: result.before, afterData: result.restored,
    })
    return NextResponse.json({ data: result.restored, message: '记录已恢复归档' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof ArchivedRecordRestoreError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Restore archived record error:', error)
    return NextResponse.json({ error: '恢复归档失败' }, { status: 500 })
  }
}
