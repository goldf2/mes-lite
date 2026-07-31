import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { ensureAttachmentThumbnail } from '@/lib/attachment-thumbnail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('attachments', 'read')
    if (denied) return denied

    const attachment = await prisma.documentAttachment.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        mimeType: true,
        storagePath: true,
        rotation: true,
        deletedAt: true,
      },
    })
    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: '附件不存在' }, { status: 404 })
    }
    if (
      attachment.mimeType !== 'application/pdf'
      && !attachment.mimeType.startsWith('image/')
    ) {
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
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: '附件文件不存在' }, { status: 404 })
    }
    console.error('Read attachment thumbnail error:', error)
    return NextResponse.json({ error: '生成附件缩略图失败' }, { status: 500 })
  }
}
