'use client'

import type { BusinessDocumentKind } from '../contracts/business-document'

export function businessDocumentPrintUrl(kind: BusinessDocumentKind, id: string) {
  return `/api/business-documents/${kind}/${id}/print`
}
