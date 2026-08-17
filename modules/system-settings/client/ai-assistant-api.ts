export async function loadAiAssistantStatus<T>() {
  const response = await fetch('/api/ai/status')
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T
    error?: string
  }
  if (!response.ok || !payload.data)
    throw new Error(payload.error || '无法检查 AI 服务状态')
  return payload.data
}

export async function sendAiAssistantQuestion<T>(
  input: unknown,
  signal: AbortSignal,
) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T
    error?: string
  }
  if (!response.ok || !payload.data)
    throw new Error(payload.error || 'AI 服务暂时不可用')
  return payload.data
}

export async function recognizeAiAssistantImage<T>(
  input: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/ai/image-recognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T
    error?: string
  }
  if (!response.ok || !payload.data)
    throw new Error(payload.error || '图片识别暂时不可用')
  return payload.data
}
