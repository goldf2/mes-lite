import { prisma } from '@/lib/prisma'
import { withAttachmentUrls, withMaterialImageUrls } from '@/lib/attachment-urls'
import { AttachmentDomainError } from '../domain/attachment-errors'
import { isMaterialImageAttachment } from '../domain/attachment-policy'

export function withManagedAttachmentUrls<T extends {
  id: string
  ownerType: string
  documentType: string
  originalName: string
  mimeType: string
  size: number
  rotation: number
}>(attachment: T) {
  return isMaterialImageAttachment(attachment)
    ? withMaterialImageUrls(attachment)
    : withAttachmentUrls(attachment)
}

export async function listManagedAttachments(ownerType: string, ownerId: string, draftUploadedBy?: string) {
  const attachments = await prisma.documentAttachment.findMany({
    where: { ownerType, ownerId, deletedAt: null, ...(draftUploadedBy ? { uploadedBy: draftUploadedBy } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  return attachments.map(withManagedAttachmentUrls)
}

export async function requireActiveAttachment(id: string) {
  const attachment = await prisma.documentAttachment.findUnique({ where: { id } })
  if (!attachment || attachment.deletedAt) throw new AttachmentDomainError('附件不存在或已归档', 404)
  return attachment
}
