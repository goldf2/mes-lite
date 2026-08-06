import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { isAttachmentRotation } from '@/lib/attachment-rotation'
import { attachmentUploadRoot, ensureAttachmentThumbnail } from '@/lib/attachment-thumbnail'
import { ensureAttachmentImageVariant } from '@/lib/attachment-image-variants'
import { withAttachmentUrls, withMaterialImageUrls } from '@/lib/attachment-urls'
import { MAX_ATTACHMENT_FILE_SIZE, attachmentPreviewKind, normalizeAttachmentMimeType } from '@/lib/attachment-file-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    return NextResponse.json({
      data: attachments.map((attachment) => (
        attachment.ownerType === 'MATERIAL'
        && attachment.documentType === 'MATERIAL_IMAGE'
        && attachment.mimeType.startsWith('image/')
          ? withMaterialImageUrls(attachment)
          : withAttachmentUrls(attachment)
      )),
    })
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

    if (file.size <= 0 || file.size > MAX_ATTACHMENT_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小必须在 50MB 以内' }, { status: 400 })
    }

    const mimeType = normalizeAttachmentMimeType(file.name, file.type)
    const safePreviewKind = attachmentPreviewKind(file.name, mimeType)
    if (ownerType === 'MATERIAL' && documentType === 'MATERIAL_IMAGE' && safePreviewKind !== 'image') {
      return NextResponse.json({ error: '物料图片只支持可安全预览的图片格式' }, { status: 400 })
    }

    const ownerTypeDir = safeSegment(ownerType)
    const ownerIdDir = safeSegment(ownerId)
    const uploadDir = path.join(attachmentUploadRoot(), ownerTypeDir, ownerIdDir)
    await mkdir(uploadDir, { recursive: true })

    const fileName = `${Date.now()}-${randomUUID()}${extensionFrom(file.name, mimeType)}`
    const storagePath = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(storagePath, buffer)

    const url = `/uploads/${ownerTypeDir}/${ownerIdDir}/${fileName}`
    const isMaterialImage = ownerType === 'MATERIAL' && documentType === 'MATERIAL_IMAGE' && safePreviewKind === 'image'
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
        mimeType,
        size: file.size,
        url,
        storagePath,
        note,
        uploadedBy,
        isCover: isMaterialImage && existingImageCount === 0,
      },
    })
    if (safePreviewKind === 'image') {
      try {
        if (isMaterialImage) {
          await Promise.all([
            ensureAttachmentImageVariant(attachment, 'thumbnail'),
            ensureAttachmentImageVariant(attachment, 'display'),
          ])
        } else {
          await ensureAttachmentThumbnail(attachment)
        }
      } catch (error) {
        console.error('Generate uploaded attachment image preview error:', error)
      }
    }

    return NextResponse.json({
      data: isMaterialImage ? withMaterialImageUrls(attachment) : withAttachmentUrls(attachment),
    }, { status: 201 })
  } catch (error) {
    console.error('Upload attachment error:', error)
    return NextResponse.json({ error: '上传附件失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const readDenied = await requireResourcePermission('attachments', 'read')
    if (readDenied) return readDenied

    const body = await req.json()
    const id = String(body.id || '')
    const action = String(body.action || '')
    if (!id || !['SET_COVER', 'SET_ROTATION'].includes(action)) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    const attachment = await prisma.documentAttachment.findUnique({ where: { id } })
    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: '附件不存在或已归档' }, { status: 404 })
    }

    if (action === 'SET_ROTATION') {
      const permissionResource = attachment.ownerType === 'WORK_INSTRUCTION'
        ? 'workInstructions'
        : attachment.ownerType === 'MATERIAL'
          ? 'materials'
          : 'attachments'
      const denied = await requireResourcePermission(permissionResource, 'update')
      if (denied) return denied

      const rotation = Number(body.rotation)
      if (!Number.isInteger(rotation) || !isAttachmentRotation(rotation)) {
        return NextResponse.json({ error: '旋转角度只能为 0、90、180 或 270' }, { status: 400 })
      }

      const updated = await prisma.documentAttachment.update({
        where: { id },
        data: { rotation },
      })
      await writeAuditLog(req, {
        action: 'UPDATE',
        entityType: 'DOCUMENT_ATTACHMENT',
        entityId: attachment.id,
        entityLabel: attachment.originalName,
        beforeData: { rotation: attachment.rotation },
        afterData: { rotation: updated.rotation },
        note: `文件显示方向调整为 ${updated.rotation}°`,
      })
      const isMaterialImage = updated.ownerType === 'MATERIAL'
        && updated.documentType === 'MATERIAL_IMAGE'
        && updated.mimeType.startsWith('image/')
      return NextResponse.json({
        data: isMaterialImage ? withMaterialImageUrls(updated) : withAttachmentUrls(updated),
        message: '文件方向已保存',
      })
    }

    const denied = await requireResourcePermission('materials', 'update')
    if (denied) return denied

    if (
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
