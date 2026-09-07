'use client'

import type { BusinessDocumentKind } from '../contracts/business-document'

export function businessDocumentPrintUrl(
  kind: BusinessDocumentKind,
  id: string,
  options: { audience?: 'customer' | 'internal'; download?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (options.audience) params.set('audience', options.audience)
  if (options.download) params.set('download', '1')
  const query = params.toString()
  return `/api/business-documents/${kind}/${id}/print${query ? `?${query}` : ''}`
}
