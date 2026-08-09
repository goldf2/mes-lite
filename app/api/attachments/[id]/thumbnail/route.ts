import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { requireResourcePermission } from '@/lib/permissions'
import { ensureAttachmentThumbnail } from '@/lib/attachment-thumbnail'
import { canGenerateAttachmentThumbnail } from '@/lib/attachment-file-types'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireActiveAttachment } from '@/modules/attachments/server/attachment-query-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('attachments', 'read')
    if (denied) return denied

    const attachment = await requireActiveAttachment(params.id)
    if (!canGenerateAttachmentThumbnail(attachment.originalName, attachment.mimeType)) {
      return NextResponse.json({ error: '该附件类型不支持缩略图' }, { status: 415 })
    }

    const etag = `"attachment-thumbnail-${attachment.id}-${attachment.rotation}"`
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }

    const thumbnailPath = await ensureAttachmentThumbnail(attachment)
    const file = await readFile(thumbnailPath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(file.length),
        'Cache-Control': 'private, max-age=86400',
        ETag: etag,
      },
    })
  } catch (error: any) {
    if (error instanceof AttachmentDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: '附件文件不存在' }, { status: 404 })
    }
    console.error('Read attachment thumbnail error:', error)
    return NextResponse.json({ error: '生成附件缩略图失败' }, { status: 500 })
  }
}
