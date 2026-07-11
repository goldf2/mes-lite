import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('attachments', 'read')
    if (denied) return denied

    const attachment = await prisma.documentAttachment.findUnique({
      where: { id: params.id },
    })
    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: '附件不存在' }, { status: 404 })
    }

    const uploadRoot = path.resolve(process.cwd(), 'public', 'uploads')
    const storagePath = path.resolve(attachment.storagePath)
    if (!storagePath.startsWith(`${uploadRoot}${path.sep}`)) {
      return NextResponse.json({ error: '附件路径无效' }, { status: 400 })
    }

    const file = await readFile(storagePath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(file.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: '附件文件不存在' }, { status: 404 })
    }
    console.error('Read attachment file error:', error)
    return NextResponse.json({ error: '读取附件失败' }, { status: 500 })
  }
}
