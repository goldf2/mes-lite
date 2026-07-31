'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'

export interface PreviewAttachment {
  id: string
  originalName: string
  mimeType: string
  url: string
  note?: string | null
  rotation?: number
}

const pdfModuleSrc = '/pdfjs/pdf.mjs'
const pdfWorkerSrc = '/pdfjs/pdf.worker.min.mjs'

function PdfFirstPagePreview({ attachment }: { attachment: PreviewAttachment }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    let renderTask: RenderTask | null = null
    let loadingTask: PDFDocumentLoadingTask | null = null

    const renderPreview = async () => {
      try {
        setState('loading')
        const pdfjs = await import(/* webpackIgnore: true */ pdfModuleSrc) as typeof import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
        loadingTask = pdfjs.getDocument({ url: attachment.url })
        const loadedDocument = await loadingTask.promise
        const page = await loadedDocument.getPage(1)
        const canvas = canvasRef.current
        if (!active || !canvas) return

        const rotation = normalizeAttachmentRotation(Number(page.rotate || 0) + Number(attachment.rotation || 0))
        const baseViewport = page.getViewport({ scale: 1, rotation })
        const containerWidth = canvas.parentElement?.clientWidth || 320
        const containerHeight = canvas.parentElement?.clientHeight || containerWidth * 0.75
        const viewport = page.getViewport({
          scale: Math.max(0.1, Math.min(
            2,
            containerWidth / Math.max(baseViewport.width, 1),
            containerHeight / Math.max(baseViewport.height, 1)
          )),
          rotation,
        })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建 PDF 预览画布')
        const currentRenderTask = page.render({
          canvas: null,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: '#ffffff',
        })
        renderTask = currentRenderTask
        await currentRenderTask.promise
        if (active) setState('ready')
      } catch (error) {
        if (active && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          console.error('Render PDF preview failed:', error)
          setState('error')
        }
      }
    }

    void renderPreview()
    return () => {
      active = false
      renderTask?.cancel()
      void loadingTask?.destroy()
    }
  }, [attachment.rotation, attachment.url])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label={`${attachment.originalName} 首页预览`}
        className={`max-h-full max-w-full bg-white object-contain shadow-sm ${state === 'ready' ? 'block' : 'hidden'}`}
      />
      {state === 'loading' && (
        <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          正在生成 PDF 预览
        </div>
      )}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-1 text-red-700">
          <span className="text-base font-semibold">PDF</span>
          <span className="text-xs">预览不可用</span>
        </div>
      )}
    </>
  )
}

export default function DocumentPreviewThumb({
  attachment,
  title,
  className = '',
}: {
  attachment?: PreviewAttachment | null
  title: string
  className?: string
}) {
  return (
    <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 ${className}`}>
      {attachment ? (
        attachment.mimeType.startsWith('image/') ? (
          <img
            src={attachment.url}
            alt={attachment.note || title}
            className="h-full w-full object-contain"
            style={{ transform: `rotate(${attachment.rotation || 0}deg)` }}
          />
        ) : attachment.mimeType === 'application/pdf' ? (
          <PdfFirstPagePreview attachment={attachment} />
        ) : (
          <div className="text-sm text-gray-500">暂不支持预览</div>
        )
      ) : (
        <span className="text-sm text-gray-400">暂无文件</span>
      )}
    </div>
  )
}
