'use client'

import { Copy, Download, QrCode, Save } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import AppButton from './AppButton'
import ModalDialog from './ModalDialog'
import ControlTooltip from './ControlTooltip'

interface QrCardTemplate {
  displayTitle: string
  functionLabel: string
  description: string
  footer: string
  showState: boolean
  showUrl: boolean
  showGeneratedAt: boolean
}

const qrTemplateStorageKey = 'mes-lite.qr-card-template.v1'

function readSavedTemplate(): Partial<QrCardTemplate> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(qrTemplateStorageKey) || '{}')
  } catch {
    return {}
  }
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || '页面二维码'
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = []
  let current = ''
  for (const character of value) {
    const next = current + character
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current)
      current = character
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export default function PageQrCodeButton({
  pageTitle,
  functionPath,
  stateSummary,
  shareUrl,
  compact = false,
}: {
  pageTitle: string
  functionPath: string
  stateSummary?: string
  shareUrl?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [generatedAt, setGeneratedAt] = useState('')
  const [template, setTemplate] = useState<QrCardTemplate>({
    displayTitle: pageTitle,
    functionLabel: functionPath,
    description: '',
    footer: '使用 MES-lite 扫码或在浏览器中打开',
    showState: true,
    showUrl: false,
    showGeneratedAt: true,
  })
  const resolvedUrl = shareUrl || (typeof window !== 'undefined' ? window.location.href : '')

  useEffect(() => {
    if (!open) return
    const saved = readSavedTemplate()
    setTemplate((current) => ({
      ...current,
      ...saved,
      displayTitle: pageTitle,
      functionLabel: functionPath,
    }))
    setGeneratedAt(new Date().toLocaleString('zh-CN', { hour12: false }))
  }, [functionPath, open, pageTitle])

  useEffect(() => {
    if (!open || !resolvedUrl) return
    QRCode.toDataURL(resolvedUrl, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 640,
      color: { dark: '#111827', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setNotice('二维码生成失败'))
  }, [open, resolvedUrl])

  const visibleDetails = useMemo(() => [
    template.functionLabel,
    template.showState ? stateSummary : '',
    template.showUrl ? resolvedUrl : '',
    template.showGeneratedAt ? `生成时间：${generatedAt}` : '',
  ].filter((value): value is string => Boolean(value)), [generatedAt, resolvedUrl, stateSummary, template])

  const saveTemplate = () => {
    window.localStorage.setItem(qrTemplateStorageKey, JSON.stringify({
      description: template.description,
      footer: template.footer,
      showState: template.showState,
      showUrl: template.showUrl,
      showGeneratedAt: template.showGeneratedAt,
    }))
    setNotice('默认下载模板已保存到当前浏览器')
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(resolvedUrl)
    setNotice('链接已复制')
  }

  const downloadPng = async () => {
    if (!qrDataUrl) return
    const canvas = document.createElement('canvas')
    const width = 960
    const padding = 72
    const qrSize = 440
    const context = canvas.getContext('2d')
    if (!context) return

    context.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    const descriptionLines = wrapCanvasText(context, template.description.trim(), width - padding * 2)
    const detailLineCount = visibleDetails.reduce((count, detail) => count + wrapCanvasText(context, detail, width - padding * 2).length, 0)
    const height = 170 + descriptionLines.length * 38 + qrSize + detailLineCount * 34 + 150
    canvas.width = width
    canvas.height = Math.max(980, height)

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#2563eb'
    context.fillRect(0, 0, canvas.width, 16)
    context.textAlign = 'center'
    context.fillStyle = '#111827'
    context.font = '700 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.fillText(template.displayTitle || pageTitle, width / 2, 88)

    let y = 130
    if (template.description.trim()) {
      context.fillStyle = '#4b5563'
      context.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      for (const line of descriptionLines) {
        context.fillText(line, width / 2, y)
        y += 38
      }
      y += 10
    }

    const qrImage = await loadImage(qrDataUrl)
    context.drawImage(qrImage, (width - qrSize) / 2, y, qrSize, qrSize)
    y += qrSize + 42

    context.fillStyle = '#374151'
    context.font = '26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    for (const detail of visibleDetails) {
      for (const line of wrapCanvasText(context, detail, width - padding * 2)) {
        context.fillText(line, width / 2, y)
        y += 34
      }
      y += 4
    }

    if (template.footer.trim()) {
      context.strokeStyle = '#e5e7eb'
      context.beginPath()
      context.moveTo(padding, y + 18)
      context.lineTo(width - padding, y + 18)
      context.stroke()
      context.fillStyle = '#6b7280'
      context.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      context.fillText(template.footer.trim(), width / 2, y + 64)
    }

    const link = document.createElement('a')
    link.download = `${safeFileName(template.displayTitle || pageTitle)}-二维码.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setNotice('二维码信息卡已下载')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="当前页面二维码"
        className={`group relative flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 ${compact ? 'h-9 w-9' : 'h-9 gap-2 px-3 text-sm'}`}
      >
        <QrCode aria-hidden="true" className="h-4 w-4" />
        {!compact && <span>二维码</span>}
        {compact && <ControlTooltip label="当前页面二维码" hidden={open} />}
      </button>

      {open && (
        <ModalDialog
          title="页面二维码"
          description="编辑下载信息卡；二维码始终指向当前可分享页面状态。"
          onClose={() => setOpen(false)}
          size="xl"
          bodyClassName="!p-0"
          footer={(
            <>
              <AppButton onClick={saveTemplate}><Save aria-hidden="true" size={16} />保存模板</AppButton>
              <AppButton onClick={copyLink}><Copy aria-hidden="true" size={16} />复制链接</AppButton>
              <AppButton variant="primary" onClick={downloadPng} disabled={!qrDataUrl}><Download aria-hidden="true" size={16} />下载 PNG</AppButton>
            </>
          )}
        >
          <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
            <div className="space-y-4 border-b border-gray-100 p-5 lg:border-b-0 lg:border-r">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">页面标题<input value={template.displayTitle} onChange={(event) => setTemplate((current) => ({ ...current, displayTitle: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                <label className="block text-sm font-medium text-gray-700">页面功能<input value={template.functionLabel} onChange={(event) => setTemplate((current) => ({ ...current, functionLabel: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              </div>
              <label className="block text-sm font-medium text-gray-700">说明<textarea value={template.description} onChange={(event) => setTemplate((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="可添加用途、注意事项或操作说明" className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-gray-700">页脚<input value={template.footer} onChange={(event) => setTemplate((current) => ({ ...current, footer: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              <fieldset className="rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-sm font-medium text-gray-700">显示内容</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ['showState', '页面状态'],
                    ['showUrl', '访问地址'],
                    ['showGeneratedAt', '生成时间'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      <input type="checkbox" checked={template[key]} onChange={(event) => setTemplate((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {notice && <div role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{notice}</div>}
            </div>

            <div className="bg-gray-100 p-5">
              <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <div className="text-xl font-bold text-gray-900">{template.displayTitle || pageTitle}</div>
                {template.description && <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{template.description}</div>}
                <div className="mx-auto mt-4 aspect-square w-[min(100%,17rem)] rounded-xl bg-white p-1">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 二维码是浏览器即时生成的 data URL，不经过图片优化服务。
                    <img src={qrDataUrl} alt="当前页面二维码" className="h-full w-full" />
                  ) : <div className="flex h-full items-center justify-center text-sm text-gray-400">正在生成二维码…</div>}
                </div>
                <div className="mt-4 space-y-1 text-xs leading-5 text-gray-600">
                  {visibleDetails.map((detail) => <div key={detail} className="break-all">{detail}</div>)}
                </div>
                {template.footer && <div className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-500">{template.footer}</div>}
              </div>
            </div>
          </div>
        </ModalDialog>
      )}
    </>
  )
}
