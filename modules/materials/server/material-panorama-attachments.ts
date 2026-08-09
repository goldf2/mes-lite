import {
  type AttachmentWithPreviewFields,
  type MaterialImageWithPreviewFields,
  withAttachmentUrls,
  withMaterialImageUrls,
} from '@/lib/attachment-urls'

interface MaterialAttachment extends MaterialImageWithPreviewFields {
  documentType: string
  originalName: string
  note: string | null
  mimeType: string
}

function isWorkInstruction(attachment: MaterialAttachment) {
  const text = `${attachment.documentType} ${attachment.originalName} ${attachment.note || ''}`.toLowerCase()
  return attachment.documentType === 'WORK_INSTRUCTION' || text.includes('作业指导') || text.includes('sop') || text.includes('wi')
}

export function classifyMaterialAttachments<T extends MaterialAttachment>(attachments: T[]) {
  const withUrls = (attachment: T) => attachment.documentType === 'MATERIAL_IMAGE' && attachment.mimeType.startsWith('image/')
    ? withMaterialImageUrls(attachment)
    : withAttachmentUrls(attachment)
  return {
    images: attachments.filter((attachment) => attachment.mimeType.startsWith('image/')).map(withUrls),
    workInstructions: attachments.filter(isWorkInstruction).map(withUrls),
    documents: attachments
      .filter((attachment) => !attachment.mimeType.startsWith('image/') || attachment.documentType !== 'MATERIAL_IMAGE')
      .map(withUrls),
  }
}

export function attachWorkInstructionFiles<
  T extends { id: string },
  A extends AttachmentWithPreviewFields & { ownerId: string; mimeType: string },
>(instructions: T[], attachments: A[]) {
  const byOwner = new Map<string, A[]>()
  for (const attachment of attachments) {
    const list = byOwner.get(attachment.ownerId) || []
    list.push(attachment)
    byOwner.set(attachment.ownerId, list)
  }
  return instructions.map((instruction) => {
    const files = byOwner.get(instruction.id) || []
    return {
      ...instruction,
      attachments: files.map(withAttachmentUrls),
      attachmentCount: files.length,
      imageCount: files.filter((attachment) => attachment.mimeType.startsWith('image/')).length,
      pdfCount: files.filter((attachment) => attachment.mimeType === 'application/pdf').length,
    }
  })
}
