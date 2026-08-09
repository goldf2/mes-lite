'use client'

import { Printer } from 'lucide-react'
import type { BusinessDocumentKind } from '../contracts/business-document'
import { businessDocumentPrintUrl } from '../client/business-document-client'

export default function BusinessDocumentPrintLink({
  kind,
  id,
  compact = false,
}: {
  kind: BusinessDocumentKind
  id: string
  compact?: boolean
}) {
  return (
    <a
      href={businessDocumentPrintUrl(kind, id)}
      target="_blank"
      rel="noreferrer"
      title="打印单据"
      aria-label="打印单据"
      className="inline-flex items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      {!compact && <span>打印</span>}
    </a>
  )
}
