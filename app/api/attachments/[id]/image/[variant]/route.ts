import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import {
  attachmentImageVariantVersion,
  ensureAttachmentImageVariant,
  isAttachmentImageVariant,
} from '@/lib/attachment-image-variants'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireManagedAttachmentAccess } from '@/modules/attachments/server/attachment-authorization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string; variant: string } },
) {
  try {
    if (!isAttachmentImageVariant(params.variant)) {
      return NextResponse.json({ error: '图片规格不存在' }, { status: 404 })
    }

    const { attachment } = await requireManagedAttachmentAccess(params.id, 'read')
    if (!attachment.mimeType.startsWith('image/')) {
      return NextResponse.json({ error: '该附件类型不支持图片优化' }, { status: 415 })
    }

    const version = attachmentImageVariantVersion(attachment)
    const etag = `"attachment-image-${attachment.id}-${params.variant}-${version}"`
    const cacheControl = params.variant === 'thumbnail'
      ? 'private, max-age=7776000, immutable'
      : 'private, max-age=2592000, immutable'
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }

    const variantPath = await ensureAttachmentImageVariant(attachment, params.variant)
    const file = await readFile(variantPath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(file.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${attachment.originalName}.${params.variant}.webp`)}`,
        'Cache-Control': cacheControl,
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
    console.error('Read optimized attachment image error:', error)
    return NextResponse.json({ error: '生成优化图片失败' }, { status: 500 })
  }
}
