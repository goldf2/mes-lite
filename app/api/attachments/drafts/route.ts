import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { draftAttachmentSchema } from '@/modules/attachments/contracts/attachment-schema'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireManagedAttachmentOwnerAccess } from '@/modules/attachments/server/attachment-authorization-service'
import {
  discardManagedDraftAttachments,
  finalizeManagedDraftAttachments,
} from '@/modules/attachments/server/attachment-command-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function draftError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: '暂存附件参数无效' }, { status: 400 })
  if (error instanceof AttachmentDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function POST(req: NextRequest) {
  try {
    const input = draftAttachmentSchema.parse(await req.json())
    const { operator } = await requireManagedAttachmentOwnerAccess(input.ownerType, input.targetOwnerId!, 'finalize')
    const result = await finalizeManagedDraftAttachments(input, operator.id)
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
    const input = draftAttachmentSchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    const draftOwnerType = `DOCUMENT_DRAFT_${input.ownerType}`
    const { operator } = await requireManagedAttachmentOwnerAccess(draftOwnerType, input.draftOwnerId, 'discard')
    const result = await discardManagedDraftAttachments(input, operator.id)
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    return draftError(error, '暂存附件清理失败')
  }
}
