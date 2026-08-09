'use client'

import type { BusinessDocumentKind } from '../contracts/business-document'

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
