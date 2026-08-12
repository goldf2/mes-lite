import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import {
  attachmentMutationSchema,
  attachmentOwnerQuerySchema,
  parseAttachmentUploadForm,
} from '@/modules/attachments/contracts/attachment-schema'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import {
  requireManagedAttachmentAccess,
  requireManagedAttachmentOwnerAccess,
} from '@/modules/attachments/server/attachment-authorization-service'
import {
  archiveManagedAttachment,
  setManagedAttachmentRotation,
  setMaterialImageCover,
  uploadManagedAttachment,
} from '@/modules/attachments/server/attachment-command-service'
import { listManagedAttachments } from '@/modules/attachments/server/attachment-query-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function attachmentError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || '附件参数无效' }, { status: 400 })
  }
  if (error instanceof AttachmentDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const input = attachmentOwnerQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    const { operator, context } = await requireManagedAttachmentOwnerAccess(input.ownerType, input.ownerId, 'read')
    return NextResponse.json({
      data: await listManagedAttachments(input.ownerType, input.ownerId, context.draft ? operator.id : undefined),
    })
  } catch (error) {
    return attachmentError(error, '获取附件失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = parseAttachmentUploadForm(await req.formData())
    const { operator } = await requireManagedAttachmentOwnerAccess(input.ownerType, input.ownerId, 'upload')
    const attachment = await uploadManagedAttachment(input, operator.id)
    return NextResponse.json({ data: attachment }, { status: 201 })
  } catch (error) {
    return attachmentError(error, '上传附件失败')
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const input = attachmentMutationSchema.parse(await req.json())
    await requireManagedAttachmentAccess(input.id, 'update')

    if (input.action === 'SET_COVER') {
      await setMaterialImageCover(input.id)
      return NextResponse.json({ success: true, message: '封面已更新' })
    }

    const { before, updated } = await setManagedAttachmentRotation(input.id, input.rotation)
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'DOCUMENT_ATTACHMENT',
      entityId: before.id,
      entityLabel: before.originalName,
      beforeData: { rotation: before.rotation },
      afterData: { rotation: updated.rotation },
      note: `文件显示方向调整为 ${updated.rotation}°`,
    })
    return NextResponse.json({ data: updated, message: '文件方向已保存' })
  } catch (error) {
    return attachmentError(error, '更新附件失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = z.string().trim().min(1, '缺少附件 ID').parse(new URL(req.url).searchParams.get('id'))
    await requireManagedAttachmentAccess(id, 'archive')
    await archiveManagedAttachment(id)
    return NextResponse.json({ success: true, message: '附件已归档' })
  } catch (error) {
    return attachmentError(error, '归档附件失败')
  }
}
