import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { attachmentPreviewKind } from '@/lib/attachment-file-types'
import { resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { ensureOfficeDocumentPreview } from '@/lib/office-document-preview'
import { AttachmentDomainError } from '@/modules/attachments/domain/attachment-errors'
import { requireManagedAttachmentAccess } from '@/modules/attachments/server/attachment-authorization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { attachment } = await requireManagedAttachmentAccess(params.id, 'read')

    const kind = attachmentPreviewKind(attachment.originalName, attachment.mimeType)
    if (kind !== 'office' && kind !== 'text') {
      return NextResponse.redirect(new URL(`/api/attachments/${attachment.id}/file`, _req.url))
    }

    const previewPath = kind === 'office'
      ? await ensureOfficeDocumentPreview(attachment)
      : resolveAttachmentStoragePath(attachment.storagePath)
    const file = await readFile(previewPath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': kind === 'office' ? 'application/pdf' : 'text/plain; charset=utf-8',
        'Content-Length': String(file.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(kind === 'office' ? `${attachment.originalName}.pdf` : attachment.originalName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error: any) {
    if (error instanceof AttachmentDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: '附件文件不存在' }, { status: 404 })
    }
    console.error('Generate attachment preview error:', error)
    return NextResponse.json({ error: '生成文件预览失败，请下载原文件查看' }, { status: 503 })
  }
}
