import type { PermissionResource } from '@/lib/permissions'
import {
  isDraftDocumentAttachmentOwnerType,
  targetOwnerTypeFromDraft,
} from '@/lib/draft-document-attachments'

export const attachmentOwnerPolicies = {
  MATERIAL: { resource: 'materials' },
  WORK_INSTRUCTION: { resource: 'workInstructions' },
  MATERIAL_IN: { resource: 'materialIn' },
  PRODUCTION_ORDER: { resource: 'orders' },
  DISPATCH: { resource: 'dispatch' },
  SALES_ORDER: { resource: 'salesOrder' },
  SHIPMENT: { resource: 'shipment' },
  RETURN_ORDER: { resource: 'return' },
  FLOW_TRANSFER: { resource: 'flowTransfers' },
  EQUIPMENT_INSPECTION_RECORD: { resource: 'equipmentInspections' },
  EQUIPMENT_MAINTENANCE_WORK_ORDER: { resource: 'equipmentMaintenance' },
} as const satisfies Record<string, { resource: PermissionResource }>

export type AttachmentOwnerType = keyof typeof attachmentOwnerPolicies

export type AttachmentOwnerContext = {
  requestedOwnerType: string
  targetOwnerType: AttachmentOwnerType
  resource: PermissionResource
  draft: boolean
}

export function resolveAttachmentOwnerContext(ownerType: string): AttachmentOwnerContext | null {
  const targetOwnerType = isDraftDocumentAttachmentOwnerType(ownerType)
    ? targetOwnerTypeFromDraft(ownerType)
    : ownerType
  if (!targetOwnerType || !(targetOwnerType in attachmentOwnerPolicies)) return null
  const typedOwnerType = targetOwnerType as AttachmentOwnerType
  return {
    requestedOwnerType: ownerType,
    targetOwnerType: typedOwnerType,
    resource: attachmentOwnerPolicies[typedOwnerType].resource,
    draft: isDraftDocumentAttachmentOwnerType(ownerType),
  }
}

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
  return resolveAttachmentOwnerContext(ownerType)?.resource || 'attachments'
}
