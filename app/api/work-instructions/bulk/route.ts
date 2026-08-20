import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { workInstructionBulkUpdateSchema } from '@/modules/documents/contracts/work-instruction-schema'
import { DocumentFieldError } from '@/modules/documents/domain/document-field-errors'
import { bulkUpdateWorkInstructions } from '@/modules/documents/server/work-instruction-bulk-service'
import { WorkInstructionValidationError } from '@/modules/documents/server/work-instruction-command-service'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const input = workInstructionBulkUpdateSchema.parse(await req.json())
    const result = await bulkUpdateWorkInstructions(input)
    await writeAuditLog(req, {
      action: 'BULK_UPDATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: `bulk-${Date.now()}`,
      entityLabel: `批量修改 ${result.updated.length} 篇文档`,
      beforeData: result.before,
      afterData: result.updated,
    })
    return NextResponse.json({ data: result.updated, message: `已更新 ${result.updated.length} 篇文档` })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || '批量修改参数无效' }, { status: 400 })
    if (error instanceof DocumentFieldError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof WorkInstructionValidationError) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('Bulk update work instructions error:', error)
    return NextResponse.json({ error: '批量修改文档失败' }, { status: 500 })
  }
}
