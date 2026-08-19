import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireManagedAttachmentAccess } from '@/modules/attachments/server/attachment-authorization-service'
import {
  createWopiViewSession,
  revokeWopiViewSession,
} from '@/modules/attachments/server/wopi-view-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function officeViewError(error: unknown, fallback: string) {
  if (error instanceof AttachmentDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { attachment, session } = await createWopiViewSession(params.id, req.url)
    await writeAuditLog(req, {
      action: 'VIEW',
      entityType: 'DOCUMENT_ATTACHMENT',
      entityId: attachment.id,
      entityLabel: attachment.originalName,
      note: '通过 Collabora 只读查看表格附件',
    })
    return NextResponse.json({ data: session }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return officeViewError(error, '创建在线表格查看会话失败')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const sessionId = new URL(req.url).searchParams.get('sessionId')?.trim()
    if (!sessionId) throw new AttachmentDomainError('缺少在线查看会话 ID', 400)
    const { operator, attachment } = await requireManagedAttachmentAccess(params.id, 'read')
    await revokeWopiViewSession(sessionId, params.id, operator.id)
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'DOCUMENT_ATTACHMENT',
      entityId: attachment.id,
      entityLabel: attachment.originalName,
      note: '关闭 Collabora 只读表格查看会话',
    })
    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return officeViewError(error, '关闭在线表格查看会话失败')
  }
}
