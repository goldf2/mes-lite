'use client'

import JsBarcode from 'jsbarcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Printer, RotateCcw, ScanLine, Settings2, TriangleAlert } from 'lucide-react'
import { honeywell1900Profile, cleanScannerValue, scannerSubmitKey } from './scan-print/scannerAdapter'
import {
  LabelMediaProfile,
  labelCanvasDots,
  labelPrintPageStyle,
  pc310t203Profile,
  pc310tDefaultLabelMedia,
  pc310tLabelMediaProfiles,
} from './scan-print/labelProfiles'
import SplitWorkspace from './layout/SplitWorkspace'
import AppButton from './AppButton'

interface ScanEvent {
  id: string
  rawValue: string
  code: string
  quantity: number
  result: 'MATCHED' | 'UNKNOWN' | 'OVER'
  createdAt: string
}

interface ScanSession {
  id: string
  sessionNo: string
  name?: string | null
  expectedCode: string
  expectedQty: number
  countedQty: number
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
  scannerModel?: string | null
  createdAt: string
  events: ScanEvent[]
}

interface LabelData {
  title: string
  code: string
  name: string
  spec: string
  quantity: number
  unit: string
  note: string
}

const resultLabels = {
  MATCHED: '计数成功',
  UNKNOWN: '条码不匹配',
  OVER: '超过目标数量',
}

function formatQty(value: number) {
  return Number(value || 0).toFixed(6).replace(/\.?0+$/, '')
}

function requestId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function GenericLabel({ data, media }: { data: LabelData; media: LabelMediaProfile }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null)
  const compact = media.heightMm <= 80

  useEffect(() => {
    if (!barcodeRef.current || !data.code.trim()) return
    JsBarcode(barcodeRef.current, data.code.trim(), {
      format: 'CODE128',
      width: compact ? 1.5 : 2,
      height: compact ? 48 : 76,
      displayValue: false,
      margin: 0,
    })
  }, [compact, data.code])

  return (
    <section
      className="shipment-label-sheet"
      style={{
        width: `${media.widthMm}mm`,
        height: `${media.heightMm}mm`,
        padding: compact ? '4mm' : '6mm',
      }}
    >
      <div className={`border-b-2 border-black ${compact ? 'pb-2' : 'pb-3'}`}>
        <div className={`${compact ? 'text-[10px]' : 'text-[12px]'} font-semibold tracking-[0.18em]`}>{data.title || 'MES-lite 标签'}</div>
        <div className={`${compact ? 'mt-1 text-[16px]' : 'mt-2 text-[19px]'} font-mono font-bold`}>{data.code || 'NO-CODE'}</div>
      </div>
      {compact ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44mm] gap-4 pt-3">
          <div className="flex min-w-0 flex-col">
            <div className="text-[9px] text-gray-600">名称</div>
            <div className="mt-0.5 line-clamp-2 text-[18px] font-black leading-tight">{data.name || '标签打印校准'}</div>
            {data.spec && <div className="mt-1 line-clamp-2 text-[11px]">{data.spec}</div>}
            <div className="mt-2 border-y border-black py-1.5">
              <span className="text-[9px] text-gray-600">数量 </span>
              <span className="text-[22px] font-black">{formatQty(data.quantity)} </span>
              <span className="text-[12px]">{data.unit}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 text-[9px] leading-tight">{data.note || `PC310T 203 dpi · ${media.label}`}</div>
          </div>
          <div className="flex min-w-0 flex-col justify-end text-center">
            {data.code.trim() ? <svg ref={barcodeRef} className="mx-auto max-h-[18mm] max-w-full" /> : <div className="h-[18mm]" />}
            <div className="mt-1 truncate font-mono text-[10px] font-semibold tracking-wide">{data.code || 'NO-CODE'}</div>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-rows-[auto_auto_1fr_auto] gap-4 py-4">
          <div>
            <div className="text-[10px] text-gray-600">名称</div>
            <div className="mt-1 text-[22px] font-black leading-tight">{data.name || '标签打印校准'}</div>
            {data.spec && <div className="mt-2 text-[13px]">{data.spec}</div>}
          </div>
          <div className="border-y border-black py-4">
            <div className="text-[10px] text-gray-600">数量</div>
            <div className="mt-1 text-[32px] font-black">{formatQty(data.quantity)} <span className="text-[16px]">{data.unit}</span></div>
          </div>
          <div className="text-[13px] leading-relaxed">{data.note || `PC310T 203 dpi · ${media.label}`}</div>
          <div className="text-center">
            {data.code.trim() ? <svg ref={barcodeRef} className="mx-auto max-h-[26mm] max-w-full" /> : <div className="h-[26mm]" />}
            <div className="mt-2 font-mono text-[13px] font-semibold tracking-wider">{data.code || 'NO-CODE'}</div>
          </div>
        </div>
      )}
    </section>
  )
}

export default function ScanPrintPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [recentSessions, setRecentSessions] = useState<ScanSession[]>([])
  const [session, setSession] = useState<ScanSession | null>(null)
  const [sessionName, setSessionName] = useState('')
  const [expectedCode, setExpectedCode] = useState('')
  const [expectedQty, setExpectedQty] = useState(1)
  const [scanValue, setScanValue] = useState('')
  const [scanQuantity, setScanQuantity] = useState(1)
  const [feedback, setFeedback] = useState<{ result: ScanEvent['result']; message: string } | null>(null)
  const [printerIp, setPrinterIp] = useState('')
  const [copies, setCopies] = useState(1)
  const [mediaPresetId, setMediaPresetId] = useState(pc310tDefaultLabelMedia.id)
  const [customMediaWidthMm, setCustomMediaWidthMm] = useState(pc310tDefaultLabelMedia.widthMm)
  const [customMediaHeightMm, setCustomMediaHeightMm] = useState(pc310tDefaultLabelMedia.heightMm)
  const [labelData, setLabelData] = useState<LabelData>({
    title: 'MES-lite 标签',
    code: 'TEST-001',
    name: 'PC310T 打印校准',
    spec: '',
    quantity: 1,
    unit: '件',
    note: '扫码与标签业务联动将在后续阶段接入',
  })
  const [loading, setLoading] = useState(false)
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const startSubmittingRef = useRef(false)
  const scanSubmittingRef = useRef(false)
  const printSubmittingRef = useRef(false)

  const remainingQty = Math.max(0, Number(session?.expectedQty || 0) - Number(session?.countedQty || 0))
  const progress = session?.expectedQty ? Math.min(100, (session.countedQty / session.expectedQty) * 100) : 0
  const openSessions = useMemo(() => recentSessions.filter((item) => item.status === 'OPEN'), [recentSessions])
  const selectedMedia = useMemo<LabelMediaProfile>(() => {
    const preset = pc310tLabelMediaProfiles.find((item) => item.id === mediaPresetId)
    if (preset) return preset
    const widthMm = Number(customMediaWidthMm)
    const heightMm = Number(customMediaHeightMm)
    return {
      id: 'CUSTOM',
      label: `${formatQty(widthMm)} × ${formatQty(heightMm)} mm`,
      widthMm,
      heightMm,
    }
  }, [customMediaHeightMm, customMediaWidthMm, mediaPresetId])
  const selectedCanvas = useMemo(
    () => labelCanvasDots(selectedMedia, pc310t203Profile.dotsPerMillimeter),
    [selectedMedia],
  )

  const loadRecentSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/scan-count-sessions?purpose=GENERAL_COUNT')
      const data = await res.json()
      if (res.ok) setRecentSessions(data.data || [])
    } catch {
      // 页面核心输入仍可使用，历史列表失败时不阻断。
    }
  }, [])

  useEffect(() => {
    loadRecentSessions()
    const savedIp = window.localStorage.getItem('mes-lite.scanPrint.pc310tIp')
    if (savedIp) setPrinterIp(savedIp)
    const savedMedia = window.localStorage.getItem('mes-lite.scanPrint.pc310tMedia')
    if (savedMedia) {
      try {
        const parsed = JSON.parse(savedMedia)
        const presetExists = pc310tLabelMediaProfiles.some((item) => item.id === parsed.presetId)
        setMediaPresetId(presetExists ? parsed.presetId : 'CUSTOM')
        if (Number(parsed.widthMm) > 0) setCustomMediaWidthMm(Number(parsed.widthMm))
        if (Number(parsed.heightMm) > 0) setCustomMediaHeightMm(Number(parsed.heightMm))
      } catch {
        // 无效的本地介质偏好回退到 105 × 70 mm。
      }
    }
  }, [loadRecentSessions])

  useEffect(() => {
    window.localStorage.setItem('mes-lite.scanPrint.pc310tMedia', JSON.stringify({
      presetId: mediaPresetId,
      widthMm: customMediaWidthMm,
      heightMm: customMediaHeightMm,
    }))
  }, [customMediaHeightMm, customMediaWidthMm, mediaPresetId])

  useEffect(() => {
    if (session?.status === 'OPEN') scanInputRef.current?.focus()
  }, [session?.countedQty, session?.status])

  const startSession = async () => {
    if (!expectedCode.trim() || expectedQty <= 0) {
      onMessage('请填写目标条码和目标数量')
      return
    }
    if (startSubmittingRef.current) return
    startSubmittingRef.current = true
    setLoading(true)
    try {
      const res = await fetch('/api/scan-count-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: requestId('SESSION'),
          name: sessionName || undefined,
          expectedCode,
          expectedQty,
          purpose: 'GENERAL_COUNT',
          referenceType: 'GENERAL',
          scannerModel: honeywell1900Profile.model,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '创建扫码会话失败')
        return
      }
      setSession(data.data)
      setFeedback(null)
      await loadRecentSessions()
    } finally {
      startSubmittingRef.current = false
      setLoading(false)
    }
  }

  const submitScan = async () => {
    const rawValue = cleanScannerValue(scanValue)
    if (!session || !rawValue || scanSubmittingRef.current) return
    scanSubmittingRef.current = true
    setScanValue('')
    setLoading(true)
    try {
      const res = await fetch(`/api/scan-count-sessions/${session.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEventId: requestId('SCAN'),
          rawValue,
          quantity: Number(scanQuantity || 1),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '记录扫码失败')
        return
      }
      setSession(data.data)
      setFeedback({ result: data.scanResult, message: resultLabels[data.scanResult as ScanEvent['result']] })
    } finally {
      scanSubmittingRef.current = false
      setLoading(false)
      window.setTimeout(() => scanInputRef.current?.focus(), 0)
    }
  }

  const undoLastScan = async () => {
    if (!session) return
    const res = await fetch(`/api/scan-count-sessions/${session.id}/events`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      onMessage(data.error || '撤销扫码失败')
      return
    }
    setSession(data.data)
    setFeedback(null)
  }

  const completeSession = async () => {
    if (!session) return
    const res = await fetch(`/api/scan-count-sessions/${session.id}/complete`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      onMessage(data.error || '完成扫码计数失败')
      return
    }
    setSession(data.data)
    onMessage(data.message || '扫码计数已完成')
    await loadRecentSessions()
  }

  const requestPrint = async () => {
    if (!labelData.code.trim()) {
      onMessage('标签条码不能为空')
      return
    }
    if (
      !Number.isFinite(selectedMedia.widthMm)
      || !Number.isFinite(selectedMedia.heightMm)
      || selectedMedia.widthMm < 10
      || selectedMedia.heightMm < 10
      || selectedMedia.widthMm > 500
      || selectedMedia.heightMm > 500
    ) {
      onMessage('标签宽度和高度必须在 10–500 mm 之间')
      return
    }
    if (printSubmittingRef.current) return
    printSubmittingRef.current = true
    const ip = printerIp.trim()
    window.localStorage.setItem('mes-lite.scanPrint.pc310tIp', ip)
    try {
      const res = await fetch('/api/label-print-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: requestId('PRINT'),
          templateType: 'GENERIC_LABEL',
          referenceType: 'GENERAL',
          referenceId: labelData.code,
          copies,
          printerIp: ip || undefined,
          labelWidthMm: selectedMedia.widthMm,
          labelHeightMm: selectedMedia.heightMm,
          payload: {
            ...labelData,
            media: {
              widthMm: selectedMedia.widthMm,
              heightMm: selectedMedia.heightMm,
            },
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '记录打印任务失败')
        return
      }
      const printStyle = document.createElement('style')
      printStyle.dataset.mesLabelMedia = 'true'
      printStyle.textContent = labelPrintPageStyle(selectedMedia)
      document.head.appendChild(printStyle)
      document.body.classList.add('printing-shipment-label')
      const cleanup = () => {
        document.body.classList.remove('printing-shipment-label')
        printStyle.remove()
      }
      window.addEventListener('afterprint', cleanup, { once: true })
      window.print()
      window.setTimeout(cleanup, 1000)
    } finally {
      printSubmittingRef.current = false
    }
  }

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-gray-900">硬件工具</h2>
        <p className="mt-1 text-sm text-gray-500">扫码计数与标签打印相互独立，当前先验证设备接入、计数和打印底座。</p>
      </header>

      <SplitWorkspace
        storageKey="mes-lite.hardwareTools.splitPercent"
        primaryLabel="扫码计数"
        secondaryLabel="标签打印"
      >
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Honeywell 1900 扫码计数</h3>
              <p className="mt-1 text-sm text-gray-500">USB HID 键盘模式 · Enter/Tab 结束符 · 不绑定业务单据</p>
            </div>
          </div>

          {!session || session.status !== 'OPEN' ? (
            <div className="space-y-3">
              <input value={sessionName} onChange={(event) => setSessionName(event.target.value)} placeholder="计数任务名称（可选）" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                <input value={expectedCode} onChange={(event) => setExpectedCode(event.target.value)} placeholder="目标条码" className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm" />
                <input type="number" min="0.000001" step="any" value={expectedQty} onChange={(event) => setExpectedQty(Number(event.target.value))} className="rounded-lg border border-gray-200 px-3 py-2 text-right text-sm" />
              </div>
              <AppButton variant="create" size="lg" fullWidth disabled={loading} onClick={startSession}>
                <ScanLine className="h-5 w-5" />
                新增计数会话
              </AppButton>
              {openSessions.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">未完成会话</div>
                  <div className="space-y-2">
                    {openSessions.slice(0, 5).map((item) => (
                      <button key={item.id} type="button" onClick={() => setSession(item)} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50">
                        <span className="min-w-0 truncate">{item.name || item.sessionNo} · <span className="font-mono">{item.expectedCode}</span></span>
                        <span className="shrink-0 text-gray-500">{formatQty(item.countedQty)}/{formatQty(item.expectedQty)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{session.name || session.sessionNo}</span><span className="font-mono text-blue-700">{session.expectedCode}</span></div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
                <div className="mt-3 grid grid-cols-3 text-center">
                  <div><div className="text-xs text-gray-500">已扫</div><div className="mt-1 text-2xl font-bold text-blue-700">{formatQty(session.countedQty)}</div></div>
                  <div><div className="text-xs text-gray-500">目标</div><div className="mt-1 text-2xl font-bold">{formatQty(session.expectedQty)}</div></div>
                  <div><div className="text-xs text-gray-500">剩余</div><div className="mt-1 text-2xl font-bold text-orange-600">{formatQty(remainingQty)}</div></div>
                </div>
              </div>
              <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    ref={scanInputRef}
                    value={scanValue}
                    onChange={(event) => setScanValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (!scannerSubmitKey(event.key)) return
                      event.preventDefault()
                      submitScan()
                    }}
                    placeholder="扫描条码，或输入编码后回车"
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-4 py-3 font-mono text-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-600">单次数量<input type="number" min="0.000001" step="any" value={scanQuantity} onChange={(event) => setScanQuantity(Number(event.target.value))} className="w-28 rounded-lg border border-blue-200 bg-white px-3 py-3 text-right" /></label>
                </div>
              </div>
              {feedback && (
                <div className={`flex items-center gap-3 rounded-lg p-4 text-sm font-medium ${feedback.result === 'MATCHED' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {feedback.result === 'MATCHED' ? <CheckCircle2 className="h-5 w-5" /> : <TriangleAlert className="h-5 w-5" />}
                  {feedback.message}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={session.countedQty <= 0} onClick={undoLastScan} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />撤销最后一次</button>
                <button type="button" disabled={Math.abs(session.countedQty - session.expectedQty) > 0.000001} onClick={completeSession} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">完成计数</button>
                <button type="button" onClick={() => setSession(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">返回会话列表</button>
              </div>
              <div className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {session.events.length === 0 ? <div className="p-4 text-center text-sm text-gray-500">尚未扫码</div> : session.events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-mono">{event.code}</span>
                    <span className={event.result === 'MATCHED' ? 'text-green-700' : 'text-red-700'}>+{formatQty(event.quantity)} · {resultLabels[event.result]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Printer className="mt-0.5 h-5 w-5 text-gray-800" />
            <div>
              <h3 className="font-semibold text-gray-900">PC310T 标签打印</h3>
              <p className="mt-1 text-sm text-gray-500">203 dpi · 网线连接 · 当前 {selectedMedia.label} · 不绑定扫码会话</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={labelData.title} onChange={(event) => setLabelData({ ...labelData, title: event.target.value })} placeholder="标签标题" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={labelData.code} onChange={(event) => setLabelData({ ...labelData, code: event.target.value })} placeholder="Code 128 条码内容" className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm" />
            <input value={labelData.name} onChange={(event) => setLabelData({ ...labelData, name: event.target.value })} placeholder="名称" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={labelData.spec} onChange={(event) => setLabelData({ ...labelData, spec: event.target.value })} placeholder="规格" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input type="number" min="0" step="any" value={labelData.quantity} onChange={(event) => setLabelData({ ...labelData, quantity: Number(event.target.value) })} placeholder="数量" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={labelData.unit} onChange={(event) => setLabelData({ ...labelData, unit: event.target.value })} placeholder="单位" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <textarea value={labelData.note} onChange={(event) => setLabelData({ ...labelData, note: event.target.value })} placeholder="备注" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm sm:col-span-2" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm text-gray-700">打印机 IP<input value={printerIp} onChange={(event) => setPrinterIp(event.target.value)} placeholder="例如 192.168.1.120" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
            <label className="text-sm text-gray-700">标签份数<input type="number" min="1" max="100" value={copies} onChange={(event) => setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
            <label className="text-sm text-gray-700">
              打印介质尺寸
              <select
                value={mediaPresetId}
                onChange={(event) => setMediaPresetId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                {pc310tLabelMediaProfiles.map((media) => (
                  <option key={media.id} value={media.id}>{media.label}</option>
                ))}
                <option value="CUSTOM">自定义尺寸</option>
              </select>
            </label>
          </div>
          {mediaPresetId === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <label className="text-xs text-gray-600">
                宽度（mm）
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="0.1"
                  value={customMediaWidthMm || ''}
                  onChange={(event) => setCustomMediaWidthMm(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                高度（mm）
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="0.1"
                  value={customMediaHeightMm || ''}
                  onChange={(event) => setCustomMediaHeightMm(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 sm:grid-cols-4">
            <div><div className="text-gray-400">型号</div><div className="mt-1 font-medium">{pc310t203Profile.model}</div></div>
            <div><div className="text-gray-400">分辨率</div><div className="mt-1 font-medium">{pc310t203Profile.dpi} dpi</div></div>
            <div><div className="text-gray-400">标签</div><div className="mt-1 font-medium">{selectedMedia.label}</div></div>
            <div><div className="text-gray-400">画布</div><div className="mt-1 font-medium">{selectedCanvas.width}×{selectedCanvas.height} dots</div></div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">请在 PC310T 驱动和浏览器打印对话框中选择与页面一致的 {selectedMedia.label} 纸张，并校准标签间隙；打印使用无边距、100% 缩放。打印机 IP 当前仅保存配置，网络静默打印后续由独立桥接模块接入。</div>
          <button type="button" onClick={requestPrint} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black"><Printer className="h-5 w-5" />打印测试标签</button>
          <div className="flex items-center gap-2 text-xs text-gray-500"><Settings2 className="h-4 w-4" />当前为浏览器打印底座，不依赖扫码计数状态。</div>
        </section>
      </SplitWorkspace>

      <div className="shipment-label-print-root" aria-hidden="true">
        {Array.from({ length: copies }, (_, index) => <GenericLabel key={index} data={labelData} media={selectedMedia} />)}
      </div>
    </div>
  )
}
