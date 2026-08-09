import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { draftAttachmentSchema } from '@/modules/attachments/contracts/attachment-schema'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import {
  discardManagedDraftAttachments,
  finalizeManagedDraftAttachments,
} from '@/modules/attachments/server/attachment-command-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function draftError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError || error instanceof AttachmentDomainError) {
    return NextResponse.json({ error: error instanceof z.ZodError ? '暂存附件参数无效' : error.message }, { status: 400 })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'update')
    if (denied) return denied
    const input = draftAttachmentSchema.parse(await req.json())
    const result = await finalizeManagedDraftAttachments(input)
    if (result.count > 0) {
      await writeAuditLog(req, {
        action: 'UPDATE', entityType: 'DOCUMENT_ATTACHMENT', entityId: input.targetOwnerId!,
        entityLabel: `${input.ownerType} 新建单据附件`,
        afterData: { attachmentCount: result.count, ownerType: input.ownerType },
        note: '新建单据暂存附件已完成绑定',
      })
    }
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    return draftError(error, '暂存附件绑定失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'delete')
    if (denied) return denied
    const input = draftAttachmentSchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    const result = await discardManagedDraftAttachments(input)
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    return draftError(error, '暂存附件清理失败')
  }
}
