'use client'

import { useRef, useState } from 'react'
import { ExternalLink, ScanLine } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { lookupScannableDocument, type ScannableDocumentResult } from '@/modules/business-documents'
import { cleanScannerValue, scannerSubmitKey } from '../model/scanner-adapter'

export default function DocumentScanLookupPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<ScannableDocumentResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const resolve = async () => {
    const code = cleanScannerValue(value)
    if (!code || loading) return
    setLoading(true)
    try {
      setResult(await lookupScannableDocument(code))
      setValue('')
    } catch (error) {
      setResult(null)
      onMessage(error instanceof Error ? error.message : '扫码单据查询失败')
    } finally {
      setLoading(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <ScanLine className="mt-0.5 h-5 w-5 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-900">单据扫码</h3>
            <p className="mt-1 text-sm text-gray-500">扫描货箱码或发货单码，Enter/Tab 直接查询对应单据。</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 gap-2 lg:max-w-2xl">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (scannerSubmitKey(event.key)) {
                event.preventDefault()
                void resolve()
              }
            }}
            autoComplete="off"
            placeholder="扫描或输入 BX-/SH- 单据编码"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <AppButton onClick={() => void resolve()} disabled={loading || !value.trim()}>{loading ? '查询中…' : '查询'}</AppButton>
        </div>
      </div>
      {result && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-blue-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">{result.type === 'PACKAGE_DOCUMENT' ? '货箱单据' : '发货单'}</span>
              <span className="font-mono text-sm font-semibold text-gray-900">{result.documentNo}</span>
              <span className="text-xs text-gray-500">{result.status}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">{result.description}</div>
          </div>
          <AppButton variant="secondary" onClick={() => { window.location.href = result.href }}>
            <ExternalLink className="h-4 w-4" />
            打开单据
          </AppButton>
        </div>
      )}
    </section>
  )
}
