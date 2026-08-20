import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { workInstructionBatchImportMetadataSchema } from '@/modules/documents/contracts/work-instruction-schema'
import { DocumentFieldError } from '@/modules/documents/domain/document-field-errors'
import { batchImportWorkInstructions } from '@/modules/documents/server/work-instruction-batch-import-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const deniedInstruction = await requireResourcePermission('workInstructions', 'create')
    if (deniedInstruction) return deniedInstruction
    const deniedAttachment = await requireResourcePermission('attachments', 'create')
    if (deniedAttachment) return deniedAttachment
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const form = await req.formData()
    const metadataRaw = form.get('metadata')
    if (typeof metadataRaw !== 'string') return NextResponse.json({ error: '缺少批量导入参数' }, { status: 400 })
    const metadata = workInstructionBatchImportMetadataSchema.parse(JSON.parse(metadataRaw))
    const files = form.getAll('files').filter((value): value is File => value instanceof File)
    const result = await batchImportWorkInstructions(metadata, files, operator.id)

    await writeAuditLog(req, {
      action: 'BATCH_IMPORT',
      entityType: 'WORK_INSTRUCTION',
      entityId: `batch-${Date.now()}`,
      entityLabel: `批量导入 ${result.imported.length} 篇文档`,
      afterData: {
        imported: result.imported.map((item) => ({ id: item.instruction.id, title: item.instruction.title, attachmentId: item.attachmentId })),
        failed: result.failed,
      },
    })
    if (result.imported.length === 0) {
      return NextResponse.json({ error: result.failed[0]?.error || '批量导入失败', data: result }, { status: 400 })
    }
    return NextResponse.json({ data: result }, { status: result.failed.length > 0 ? 207 : 201 })
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json({ error: error instanceof ZodError ? error.issues[0]?.message : '批量导入参数格式错误' }, { status: 400 })
    }
    if (error instanceof DocumentFieldError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Batch import work instructions error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '批量导入失败' }, { status: 500 })
  }
}
