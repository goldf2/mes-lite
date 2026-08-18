import type { ScannableDocumentResult } from '../contracts/scannable-document'

export async function lookupScannableDocument(code: string) {
  const response = await fetch(`/api/scannable-documents/resolve?code=${encodeURIComponent(code)}`)
  const payload = await response.json() as { data?: ScannableDocumentResult; error?: string }
  if (!response.ok) throw new Error(payload.error || '扫码单据查询失败')
  if (!payload.data) throw new Error('未找到该编码对应的单据')
  return payload.data
}
