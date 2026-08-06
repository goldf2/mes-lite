export type AttachmentWithPreviewFields = {
  id: string
  mimeType?: string | null
  rotation?: number | null
}

export type MaterialImageWithPreviewFields = AttachmentWithPreviewFields & {
  size: number
}

export function attachmentFileUrl(id: string) {
  return `/api/attachments/${id}/file`
}

export function attachmentThumbnailUrl(id: string, rotation = 0) {
  return `/api/attachments/${id}/thumbnail?v=${rotation}`
}

export function attachmentImageVariantUrl(
  attachment: Pick<MaterialImageWithPreviewFields, 'id' | 'size' | 'rotation'>,
  variant: 'thumbnail' | 'display',
) {
  const rotation = Number(attachment.rotation || 0)
  return `/api/attachments/${attachment.id}/image/${variant}?v=1-${attachment.size}-${rotation}`
}

export function withMaterialImageUrls<T extends MaterialImageWithPreviewFields>(attachment: T) {
  const originalUrl = attachmentFileUrl(attachment.id)
  const thumbnailUrl = attachmentImageVariantUrl(attachment, 'thumbnail')
  const displayUrl = attachmentImageVariantUrl(attachment, 'display')

  return {
    ...attachment,
    url: displayUrl,
    originalUrl,
    thumbnailUrl,
    displayUrl,
  }
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
