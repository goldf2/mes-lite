import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { attachmentPreviewKind, MAX_ATTACHMENT_FILE_SIZE, normalizeAttachmentMimeType } from '@/lib/attachment-file-types'
import { ensureAttachmentImageVariant } from '@/lib/attachment-image-variants'
import { attachmentUploadRoot, ensureAttachmentThumbnail, removeAttachmentStoredFiles } from '@/lib/attachment-thumbnail'
import { draftDocumentAttachmentOwnerType, isDocumentSourceCredentialOwnerType } from '@/lib/draft-document-attachments'
import type { AttachmentUploadInput, DraftAttachmentInput } from '../contracts/attachment-schema'
import { AttachmentDomainError } from '../domain/attachment-errors'
import { attachmentStorageExtension, isMaterialImageAttachment, safeAttachmentStorageSegment } from '../domain/attachment-policy'
import { requireActiveAttachment, withManagedAttachmentUrls } from './attachment-query-service'

export async function uploadManagedAttachment(input: AttachmentUploadInput, uploadedBy: string) {
  if (input.file.size <= 0 || input.file.size > MAX_ATTACHMENT_FILE_SIZE) {
    throw new AttachmentDomainError('文件大小必须在 50MB 以内')
  }
  const mimeType = normalizeAttachmentMimeType(input.file.name, input.file.type)
  const previewKind = attachmentPreviewKind(input.file.name, mimeType)
  const materialImage = isMaterialImageAttachment({ ...input, mimeType })
  if (input.ownerType === 'MATERIAL' && input.documentType === 'MATERIAL_IMAGE' && !materialImage) {
    throw new AttachmentDomainError('物料图片只支持可安全预览的图片格式')
  }

  const ownerTypeDirectory = safeAttachmentStorageSegment(input.ownerType)
  const ownerIdDirectory = safeAttachmentStorageSegment(input.ownerId)
  const uploadDirectory = path.join(attachmentUploadRoot(), ownerTypeDirectory, ownerIdDirectory)
  const fileName = `${Date.now()}-${randomUUID()}${attachmentStorageExtension(input.file.name, mimeType)}`
  const storagePath = path.join(uploadDirectory, fileName)
  await mkdir(uploadDirectory, { recursive: true })
  await writeFile(storagePath, Buffer.from(await input.file.arrayBuffer()))

  let attachment
  try {
    const existingImageCount = materialImage ? await prisma.documentAttachment.count({
      where: {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        documentType: input.documentType,
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
      },
    }) : 0
    attachment = await prisma.documentAttachment.create({
      data: {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        documentType: input.documentType,
        originalName: input.file.name,
        fileName,
        mimeType,
        size: input.file.size,
        url: `/uploads/${ownerTypeDirectory}/${ownerIdDirectory}/${fileName}`,
        storagePath,
        note: input.note,
        uploadedBy,
        isCover: materialImage && existingImageCount === 0,
      },
    })
  } catch (error) {
    await rm(storagePath, { force: true })
    throw error
  }

  if (previewKind === 'image') {
    try {
      if (materialImage) {
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
  return withManagedAttachmentUrls(attachment)
}

export async function setManagedAttachmentRotation(id: string, rotation: 0 | 90 | 180 | 270) {
  const before = await requireActiveAttachment(id)
  const updated = await prisma.documentAttachment.update({ where: { id }, data: { rotation } })
  return { before, updated: withManagedAttachmentUrls(updated) }
}

export async function setMaterialImageCover(id: string) {
  const attachment = await requireActiveAttachment(id)
  if (!isMaterialImageAttachment(attachment)) throw new AttachmentDomainError('物料图片不存在', 404)
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
    prisma.documentAttachment.update({ where: { id }, data: { isCover: true } }),
  ])
  return attachment
}

export async function archiveManagedAttachment(id: string) {
  const attachment = await requireActiveAttachment(id)
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
  const [updated] = await prisma.$transaction([
    prisma.documentAttachment.update({ where: { id }, data: { deletedAt: new Date(), isCover: false } }),
    ...(nextCover ? [prisma.documentAttachment.update({ where: { id: nextCover.id }, data: { isCover: true } })] : []),
  ])
  return { before: attachment, updated, nextCoverId: nextCover?.id || null }
}

function requireDraftOwnerType(ownerType: string) {
  if (!isDocumentSourceCredentialOwnerType(ownerType)) {
    throw new AttachmentDomainError('暂存附件参数无效')
  }
  return draftDocumentAttachmentOwnerType(ownerType)
}

export async function finalizeManagedDraftAttachments(input: DraftAttachmentInput, uploadedBy: string) {
  if (!input.targetOwnerId) throw new AttachmentDomainError('暂存附件绑定参数无效')
  const draftOwnerType = requireDraftOwnerType(input.ownerType)
  return prisma.documentAttachment.updateMany({
    where: { ownerType: draftOwnerType, ownerId: input.draftOwnerId, uploadedBy, deletedAt: null },
    data: { ownerType: input.ownerType, ownerId: input.targetOwnerId },
  })
}

export async function discardManagedDraftAttachments(
  input: Pick<DraftAttachmentInput, 'ownerType' | 'draftOwnerId'>,
  uploadedBy: string,
) {
  const draftOwnerType = requireDraftOwnerType(input.ownerType)
  const attachments = await prisma.documentAttachment.findMany({
    where: { ownerType: draftOwnerType, ownerId: input.draftOwnerId, uploadedBy },
    select: { id: true, storagePath: true },
  })
  await prisma.documentAttachment.deleteMany({ where: { ownerType: draftOwnerType, ownerId: input.draftOwnerId, uploadedBy } })
  await Promise.all(attachments.map((attachment) => removeAttachmentStoredFiles(attachment.storagePath)))
  return { count: attachments.length }
}
