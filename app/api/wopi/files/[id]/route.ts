import { NextResponse } from 'next/server'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import {
  requireWopiViewAccess,
  wopiItemVersion,
} from '@/modules/attachments/server/wopi-view-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function wopiError(error: unknown) {
  if (error instanceof AttachmentDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('WOPI CheckFileInfo error:', error)
  return NextResponse.json({ error: '读取 WOPI 文件信息失败' }, { status: 500 })
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { session, attachment } = await requireWopiViewAccess(req, params.id)
    return NextResponse.json({
      BaseFileName: attachment.originalName,
      OwnerId: attachment.uploadedBy || 'system',
      Size: attachment.size,
      UserId: session.operatorId,
      UserFriendlyName: session.operator.name || session.operator.username,
      Version: wopiItemVersion(attachment),
      LastModifiedTime: attachment.createdAt.toISOString(),
      ReadOnly: true,
      UserCanWrite: false,
      UserCanNotWriteRelative: true,
      SupportsUpdate: false,
      SupportsLocks: false,
      SupportsRename: false,
      HideSaveOption: true,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return wopiError(error)
  }
}
