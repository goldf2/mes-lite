import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { requireResourcePermission } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function extensionFrom(fileName: string, mimeType: string) {
  const ext = path.extname(fileName).toLowerCase()
  if (ext) return ext
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/heic') return '.heic'
  if (mimeType === 'image/heif') return '.heif'
  if (mimeType === 'application/pdf') return '.pdf'
  return ''
}

function withFileUrl<T extends { id: string }>(attachment: T) {
  return { ...attachment, url: `/api/attachments/${attachment.id}/file` }
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const ownerType = searchParams.get('ownerType')
    const ownerId = searchParams.get('ownerId')

    if (!ownerType || !ownerId) {
      return NextResponse.json({ error: '缺少 ownerType 或 ownerId' }, { status: 400 })
    }

    const attachments = await prisma.documentAttachment.findMany({
      where: { ownerType, ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: attachments.map(withFileUrl) })
  } catch (error) {
    console.error('Get attachments error:', error)
    return NextResponse.json({ error: '获取附件失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'create')
    if (denied) return denied

    const form = await req.formData()
    const ownerType = String(form.get('ownerType') || '')
    const ownerId = String(form.get('ownerId') || '')
    const documentType = String(form.get('documentType') || 'ORIGINAL')
    const uploadedBy = String(form.get('uploadedBy') || '') || undefined
    const note = String(form.get('note') || '') || undefined
    const file = form.get('file')

    if (!ownerType || !ownerId) {
      return NextResponse.json({ error: '缺少 ownerType 或 ownerId' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少上传文件' }, { status: 400 })
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小必须在 10MB 以内' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: '仅支持 JPG、PNG、WEBP、HEIC 或 PDF' }, { status: 400 })
    }

    const ownerTypeDir = safeSegment(ownerType)
    const ownerIdDir = safeSegment(ownerId)
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', ownerTypeDir, ownerIdDir)
    await mkdir(uploadDir, { recursive: true })

    const fileName = `${Date.now()}-${randomUUID()}${extensionFrom(file.name, file.type)}`
    const storagePath = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(storagePath, buffer)

    const url = `/uploads/${ownerTypeDir}/${ownerIdDir}/${fileName}`
    const isMaterialImage = ownerType === 'MATERIAL' && documentType === 'MATERIAL_IMAGE' && file.type.startsWith('image/')
    const existingImageCount = isMaterialImage ? await prisma.documentAttachment.count({
      where: {
        ownerType,
        ownerId,
        documentType,
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
      },
    }) : 0
    const attachment = await prisma.documentAttachment.create({
      data: {
        ownerType,
        ownerId,
        documentType,
        originalName: file.name,
        fileName,
        mimeType: file.type,
        size: file.size,
        url,
        storagePath,
        note,
        uploadedBy,
        isCover: isMaterialImage && existingImageCount === 0,
      },
    })

    return NextResponse.json({ data: withFileUrl(attachment) }, { status: 201 })
  } catch (error) {
    console.error('Upload attachment error:', error)
    return NextResponse.json({ error: '上传附件失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'update')
    if (denied) return denied

    const body = await req.json()
    const id = String(body.id || '')
    if (!id || body.action !== 'SET_COVER') {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    const attachment = await prisma.documentAttachment.findUnique({ where: { id } })
    if (
      !attachment ||
      attachment.deletedAt ||
      attachment.ownerType !== 'MATERIAL' ||
      attachment.documentType !== 'MATERIAL_IMAGE' ||
      !attachment.mimeType.startsWith('image/')
    ) {
      return NextResponse.json({ error: '物料图片不存在' }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.documentAttachment.updateMany({
        where: {
          ownerType: attachment.ownerType,
          ownerId: attachment.ownerId,
          documentType: attachment.documentType,
          deletedAt: null,
        },
        data: { isCover: false },
      }),
      prisma.documentAttachment.update({
        where: { id },
        data: { isCover: true },
      }),
    ])

    return NextResponse.json({ success: true, message: '封面已更新' })
  } catch (error) {
    console.error('Set attachment cover error:', error)
    return NextResponse.json({ error: '设置封面失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('attachments', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少附件 ID' }, { status: 400 })
    }

    const attachment = await prisma.documentAttachment.findUnique({ where: { id } })
    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: '附件不存在或已归档' }, { status: 404 })
    }

    const nextCover = attachment.isCover ? await prisma.documentAttachment.findFirst({
      where: {
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
        documentType: attachment.documentType,
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
        id: { not: attachment.id },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }) : null

    await prisma.$transaction([
      prisma.documentAttachment.update({
        where: { id },
        data: { deletedAt: new Date(), isCover: false },
      }),
      ...(nextCover ? [prisma.documentAttachment.update({
        where: { id: nextCover.id },
        data: { isCover: true },
      })] : []),
    ])

    return NextResponse.json({ success: true, message: '附件已归档' })
  } catch (error) {
    console.error('Archive attachment error:', error)
    return NextResponse.json({ error: '归档附件失败' }, { status: 500 })
  }
}
