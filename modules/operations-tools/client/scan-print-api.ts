import type {
  CreateLabelPrintJobInput,
  CreateScanSessionInput,
  RecordScanEventInput,
  ScanResult,
  ScanSession,
} from '../contracts/scan-print'

interface ApiPayload<T> {
  data?: T
  message?: string
  error?: string
  scanResult?: ScanResult
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '扫码打印请求失败')
  return payload
}

export async function loadGeneralScanSessions() {
  const payload = await request<ScanSession[]>('/api/scan-count-sessions?purpose=GENERAL_COUNT')
  return payload.data || []
}

export async function createScanSession(input: CreateScanSessionInput) {
  const payload = await request<ScanSession>('/api/scan-count-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!payload.data) throw new Error('创建扫码会话后未返回数据')
  return payload.data
}

export async function recordScanEvent(sessionId: string, input: RecordScanEventInput) {
  const payload = await request<ScanSession>(`/api/scan-count-sessions/${sessionId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!payload.data || !payload.scanResult) throw new Error('记录扫码后未返回完整结果')
  return { session: payload.data, scanResult: payload.scanResult }
}

export async function undoLastScanEvent(sessionId: string) {
  const payload = await request<ScanSession>(`/api/scan-count-sessions/${sessionId}/events`, { method: 'DELETE' })
  if (!payload.data) throw new Error('撤销扫码后未返回会话')
  return payload.data
}

export async function completeScanSession(sessionId: string) {
  const payload = await request<ScanSession>(`/api/scan-count-sessions/${sessionId}/complete`, { method: 'POST' })
  if (!payload.data) throw new Error('完成扫码后未返回会话')
  return { session: payload.data, message: payload.message || '扫码计数已完成' }
}

export async function createLabelPrintJob(input: CreateLabelPrintJobInput) {
  await request<unknown>('/api/label-print-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
