import type { PermissionResource } from '@/lib/permissions'

export function safeAttachmentStorageSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function attachmentStorageExtension(fileName: string, mimeType: string) {
  const dotIndex = fileName.lastIndexOf('.')
  const separatorIndex = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
  const extension = dotIndex > separatorIndex ? fileName.slice(dotIndex).toLowerCase() : ''
  if (extension) return extension
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/heic') return '.heic'
  if (mimeType === 'image/heif') return '.heif'
  if (mimeType === 'application/pdf') return '.pdf'
  return ''
}

export function isMaterialImageAttachment(input: { ownerType: string; documentType: string; mimeType: string }) {
  return input.ownerType === 'MATERIAL'
    && input.documentType === 'MATERIAL_IMAGE'
    && input.mimeType.startsWith('image/')
}

export function attachmentUpdatePermissionResource(ownerType: string): PermissionResource {
  if (ownerType === 'WORK_INSTRUCTION') return 'workInstructions'
  if (ownerType === 'MATERIAL') return 'materials'
  return 'attachments'
}
