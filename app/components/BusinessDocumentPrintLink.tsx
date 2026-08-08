'use client'

import { Printer } from 'lucide-react'

export type BusinessDocumentKind = 'material-in' | 'sales-order' | 'shipment' | 'return' | 'flow-transfer' | 'production-order' | 'dispatch'

export function businessDocumentPrintUrl(kind: BusinessDocumentKind, id: string) {
  return `/api/business-documents/${kind}/${id}/print`
}

export async function generateBusinessDocumentPdfArchives(kind: BusinessDocumentKind, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  try {
    const responses = await Promise.all(uniqueIds.map((id) => fetch(`${businessDocumentPrintUrl(kind, id)}?regenerate=1`)))
    return responses.every((response) => response.ok)
  } catch {
    return false
  }
}

export function reserveBusinessDocumentPrintWindow() {
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.title = '正在生成单据 PDF'
    previewWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:32px;color:#475569">正在生成单据 PDF…</p>'
  }
  return {
    open(kind: BusinessDocumentKind, id: string) {
      const url = businessDocumentPrintUrl(kind, id)
      if (previewWindow && !previewWindow.closed) previewWindow.location.href = url
      else window.open(url, '_blank', 'noopener,noreferrer')
    },
    close() {
      if (previewWindow && !previewWindow.closed) previewWindow.close()
    },
  }
}

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
