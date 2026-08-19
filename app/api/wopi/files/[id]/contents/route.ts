import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import {
  requireWopiViewAccess,
  wopiItemVersion,
} from '@/modules/attachments/server/wopi-view-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function wopiError(error: unknown) {
  if (error instanceof AttachmentDomainError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return Response.json({ error: '附件文件不存在' }, { status: 404 })
  }
  console.error('WOPI GetFile error:', error)
  return Response.json({ error: '读取 WOPI 文件失败' }, { status: 500 })
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { attachment } = await requireWopiViewAccess(req, params.id)
    const storagePath = resolveAttachmentStoragePath(attachment.storagePath)
    const file = await stat(storagePath)
    const maximumSizeHeader = req.headers.get('x-wopi-maxexpectedsize')
    const maximumSize = maximumSizeHeader === null ? null : Number(maximumSizeHeader)
    if (maximumSize !== null && Number.isFinite(maximumSize) && maximumSize >= 0 && file.size > maximumSize) {
      return Response.json({ error: '附件超过查看器允许的大小' }, { status: 412 })
    }
    const stream = Readable.toWeb(createReadStream(storagePath)) as ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(file.size),
        'X-WOPI-ItemVersion': wopiItemVersion(attachment),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return wopiError(error)
  }
}
