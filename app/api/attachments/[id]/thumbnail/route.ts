import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { ensureAttachmentThumbnail } from '@/lib/attachment-thumbnail'
import { attachmentPreviewKind, canGenerateAttachmentThumbnail } from '@/lib/attachment-file-types'
import { cadPreviewVersion } from '@/lib/files/cad-document-preview'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireManagedAttachmentAccess } from '@/modules/attachments/server/attachment-authorization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { attachment } = await requireManagedAttachmentAccess(params.id, 'read')
    if (!canGenerateAttachmentThumbnail(attachment.originalName, attachment.mimeType)) {
      return NextResponse.json({ error: '该附件类型不支持缩略图' }, { status: 415 })
    }

    const previewKind = attachmentPreviewKind(attachment.originalName, attachment.mimeType)
    const cacheVersion = previewKind === 'cad' ? `-cad-v${cadPreviewVersion}` : ''
    const thumbnailPath = await ensureAttachmentThumbnail(attachment)
    const thumbnailStat = await stat(thumbnailPath)
    const etag = `"attachment-thumbnail-${attachment.id}-${attachment.rotation}${cacheVersion}-${thumbnailStat.size}-${Math.trunc(thumbnailStat.mtimeMs)}"`
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }

    const file = await readFile(thumbnailPath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(file.length),
        'Cache-Control': previewKind === 'cad' ? 'private, no-cache' : 'private, max-age=86400',
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
