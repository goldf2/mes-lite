'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import {
  createOfficeViewSession,
  OfficeViewApiError,
  revokeOfficeViewSession,
  type OfficeViewSession,
} from '../client/office-view-api'

export default function SpreadsheetDocumentViewer({
  attachmentId,
  fileName,
  downloadUrl,
  onCompatibilityPreview,
}: {
  attachmentId: string
  fileName: string
  downloadUrl: string
  onCompatibilityPreview: () => void
}) {
  const frameName = `mes-spreadsheet-${useId().replace(/:/g, '')}`
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)
  const activeSessionRef = useRef<OfficeViewSession | null>(null)
  const compatibilityPreviewRef = useRef(onCompatibilityPreview)
  compatibilityPreviewRef.current = onCompatibilityPreview
  const [attempt, setAttempt] = useState(0)
  const [session, setSession] = useState<OfficeViewSession | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const previousSession = activeSessionRef.current
    activeSessionRef.current = null
    if (previousSession) void revokeOfficeViewSession(attachmentId, previousSession.id)
    setLoading(true)
    setError('')
    setSession(null)
    submittedRef.current = false
    void createOfficeViewSession(attachmentId, controller.signal)
      .then(setSession)
      .catch((reason: Error) => {
        if (reason.name === 'AbortError') return
        if (reason instanceof OfficeViewApiError && reason.status === 503 && /未配置/.test(reason.message)) {
          compatibilityPreviewRef.current()
          return
        }
        setError(reason.message || '在线表格查看服务暂不可用')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [attachmentId, attempt])

  useEffect(() => {
    if (!session || !formRef.current) return
    activeSessionRef.current = session
    submittedRef.current = true
    setLoading(true)
    formRef.current.submit()
  }, [attachmentId, session])

  useEffect(() => () => {
    const activeSession = activeSessionRef.current
    if (activeSession) void revokeOfficeViewSession(attachmentId, activeSession.id)
  }, [attachmentId])

  if (error) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center text-white/75">
        <FileSpreadsheet className="h-16 w-16 text-white/40" />
        <div>
          <div className="text-base font-semibold text-white">无法打开在线表格</div>
          <div className="mt-1 max-w-xl text-sm text-white/60">{error}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" />重新连接
          </button>
          <button type="button" onClick={onCompatibilityPreview} className="rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
            使用兼容 PDF 预览
          </button>
          <a href={`${downloadUrl}?download=1`} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900">
            <Download className="h-4 w-4" />下载原文件
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-white">
      <iframe
        name={frameName}
        title={`${fileName} 在线表格预览`}
        className="h-full w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write"
        onLoad={() => {
          if (submittedRef.current) setLoading(false)
        }}
      />
      {session ? (
        <form ref={formRef} action={session.formActionUrl} method="post" target={frameName} className="hidden">
          <input type="hidden" name="access_token" value={session.accessToken} />
          <input type="hidden" name="access_token_ttl" value={session.accessTokenTtl} />
        </form>
      ) : null}
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-sm text-white/70">
          正在通过 LibreOffice 打开工作簿…
        </div>
      ) : null}
    </div>
  )
}
