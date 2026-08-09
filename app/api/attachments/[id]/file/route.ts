import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { requireResourcePermission } from '@/lib/permissions'
import { resolveAttachmentStoragePath } from '@/lib/attachment-thumbnail'
import { shouldServeAttachmentInline } from '@/lib/attachment-file-types'
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

    const storagePath = resolveAttachmentStoragePath(attachment.storagePath)

    const file = await readFile(storagePath)
    const forceDownload = new URL(req.url).searchParams.get('download') === '1'
    const disposition = !forceDownload && shouldServeAttachmentInline(attachment.originalName, attachment.mimeType)
      ? 'inline'
      : 'attachment'
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(file.length),
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error: any) {
    if (error instanceof AttachmentDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: '附件文件不存在' }, { status: 404 })
    }
    console.error('Read attachment file error:', error)
    return NextResponse.json({ error: '读取附件失败' }, { status: 500 })
  }
}
