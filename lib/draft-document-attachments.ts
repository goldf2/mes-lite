import {
  documentSourceCredentialOwnerTypes,
  type DocumentSourceCredentialOwnerType,
} from './document-source-credentials'

export type { DocumentSourceCredentialOwnerType } from './document-source-credentials'

export const DOCUMENT_DRAFT_OWNER_PREFIX = 'DOCUMENT_DRAFT_'

const supportedOwnerTypeSet = new Set<string>(documentSourceCredentialOwnerTypes)

export function isDocumentSourceCredentialOwnerType(value: string): value is DocumentSourceCredentialOwnerType {
  return supportedOwnerTypeSet.has(value)
}

export function draftDocumentAttachmentOwnerType(ownerType: DocumentSourceCredentialOwnerType) {
  return `${DOCUMENT_DRAFT_OWNER_PREFIX}${ownerType}`
}

export function isDraftDocumentAttachmentOwnerType(value: string) {
  const targetOwnerType = value.startsWith(DOCUMENT_DRAFT_OWNER_PREFIX)
    ? value.slice(DOCUMENT_DRAFT_OWNER_PREFIX.length)
    : ''
  return isDocumentSourceCredentialOwnerType(targetOwnerType)
}

export function targetOwnerTypeFromDraft(value: string) {
  if (!isDraftDocumentAttachmentOwnerType(value)) return null
  return value.slice(DOCUMENT_DRAFT_OWNER_PREFIX.length) as DocumentSourceCredentialOwnerType
}
