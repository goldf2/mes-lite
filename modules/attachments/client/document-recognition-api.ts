import type { DocumentRecognitionInput } from '../contracts/document-recognition'

export async function recognizeDocument(input: DocumentRecognitionInput) {
  const response = await fetch('/api/ai/document-recognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json() as {
    data?: { fields?: Record<string, unknown> }
    error?: string
    message?: string
  }
  if (!response.ok) throw new Error(payload.error || 'AI 凭据识别失败')
  return { fields: payload.data?.fields || {}, message: payload.message }
}
