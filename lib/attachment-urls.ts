export type AttachmentWithPreviewFields = {
  id: string
  mimeType?: string | null
  rotation?: number | null
}

export function attachmentFileUrl(id: string) {
  return `/api/attachments/${id}/file`
}

export function attachmentThumbnailUrl(id: string, rotation = 0) {
  return `/api/attachments/${id}/thumbnail?v=${rotation}`
}

export function withAttachmentUrls<T extends AttachmentWithPreviewFields>(attachment: T) {
  const previewable = attachment.mimeType === 'application/pdf'
    || Boolean(attachment.mimeType?.startsWith('image/'))

  return {
    ...attachment,
    url: attachmentFileUrl(attachment.id),
    thumbnailUrl: previewable
      ? attachmentThumbnailUrl(attachment.id, Number(attachment.rotation || 0))
      : null,
  }
}
