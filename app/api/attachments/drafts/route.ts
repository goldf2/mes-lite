import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { removeAttachmentStoredFiles } from '@/lib/attachment-thumbnail'
import {
  draftDocumentAttachmentOwnerType,
  isDocumentSourceCredentialOwnerType,
} from '@/lib/draft-document-attachments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  ownerType: z.string().trim().min(1).max(80),
  draftOwnerId: z.string().trim().startsWith('draft-').max(160),
  targetOwnerId: z.string().trim().min(1).max(160).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'update')
    if (denied) return denied

    const input = requestSchema.parse(await req.json())
    if (!isDocumentSourceCredentialOwnerType(input.ownerType) || !input.targetOwnerId) {
      return NextResponse.json({ error: '暂存附件绑定参数无效' }, { status: 400 })
    }
    const draftOwnerType = draftDocumentAttachmentOwnerType(input.ownerType)
    const result = await prisma.documentAttachment.updateMany({
      where: {
        ownerType: draftOwnerType,
        ownerId: input.draftOwnerId,
        deletedAt: null,
      },
      data: {
        ownerType: input.ownerType,
        ownerId: input.targetOwnerId,
      },
    })
    if (result.count > 0) {
      await writeAuditLog(req, {
        action: 'UPDATE',
        entityType: 'DOCUMENT_ATTACHMENT',
        entityId: input.targetOwnerId,
        entityLabel: `${input.ownerType} 新建单据附件`,
        afterData: { attachmentCount: result.count, ownerType: input.ownerType },
        note: '新建单据暂存附件已完成绑定',
      })
    }
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '暂存附件绑定参数不完整' }, { status: 400 })
    }
    console.error('Finalize draft attachments error:', error)
    return NextResponse.json({ error: '暂存附件绑定失败' }, { status: 500 })
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const parsed = requestSchema.safeParse({
      ownerType: searchParams.get('ownerType'),
      draftOwnerId: searchParams.get('draftOwnerId'),
    })
    if (!parsed.success || !isDocumentSourceCredentialOwnerType(parsed.data.ownerType)) {
      return NextResponse.json({ error: '暂存附件清理参数无效' }, { status: 400 })
    }
    const draftOwnerType = draftDocumentAttachmentOwnerType(parsed.data.ownerType)
    const attachments = await prisma.documentAttachment.findMany({
      where: { ownerType: draftOwnerType, ownerId: parsed.data.draftOwnerId },
      select: { id: true, storagePath: true },
    })
    await prisma.documentAttachment.deleteMany({
      where: { ownerType: draftOwnerType, ownerId: parsed.data.draftOwnerId },
    })
    await Promise.all(attachments.map((attachment) => removeAttachmentStoredFiles(attachment.storagePath)))
    return NextResponse.json({ success: true, count: attachments.length })
  } catch (error) {
    console.error('Discard draft attachments error:', error)
    return NextResponse.json({ error: '暂存附件清理失败' }, { status: 500 })
  }
}
