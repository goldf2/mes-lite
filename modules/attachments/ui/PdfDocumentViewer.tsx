'use client'

import { useRef, useEffect, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'

const pdfModuleSrc = '/pdfjs/pdf.mjs'
const pdfWorkerSrc = '/pdfjs/pdf.worker.min.mjs'

type ViewerSize = {
  width: number
  height: number
}

function PdfPageCanvas({
  document,
  pageNumber,
  rotation,
  zoom,
  viewerSize,
}: {
  document: PDFDocumentProxy
  pageNumber: number
  rotation: number
  zoom: number
  viewerSize: ViewerSize
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let renderTask: RenderTask | null = null

    const renderPage = async () => {
      try {
        setError(false)
        const page = await document.getPage(pageNumber)
        const displayRotation = normalizeAttachmentRotation(Number(page.rotate || 0) + rotation)
        const baseViewport = page.getViewport({ scale: 1, rotation: displayRotation })
        const availableWidth = Math.max(160, viewerSize.width - 32)
        const availableHeight = Math.max(160, viewerSize.height - 32)
        const fitScale = Math.max(0.1, Math.min(
          2,
          availableWidth / Math.max(baseViewport.width, 1),
          availableHeight / Math.max(baseViewport.height, 1),
        ))
        const viewport = page.getViewport({
          scale: Math.max(0.05, fitScale * zoom),
          rotation: displayRotation,
        })
        const canvas = canvasRef.current
        if (!active || !canvas) return

        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建 PDF 查看画布')
        renderTask = page.render({
          canvas: null,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: '#ffffff',
        })
        await renderTask.promise
      } catch (renderError) {
        if (active && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
          console.error('Render PDF page failed:', renderError)
          setError(true)
        }
      }
    }

    void renderPage()
    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [document, pageNumber, rotation, viewerSize.height, viewerSize.width, zoom])

  return (
    <div
      className="flex w-full shrink-0 items-center justify-center p-4"
      style={{ minHeight: Math.max(240, viewerSize.height) }}
    >
      {error ? (
        <div className="rounded bg-red-950/70 px-4 py-3 text-sm text-red-100">第 {pageNumber} 页预览失败</div>
      ) : (
        <canvas ref={canvasRef} className="bg-white shadow-xl" aria-label={`PDF 第 ${pageNumber} 页`} />
      )}
    </div>
  )
}

export default function PdfDocumentViewer({
  url,
  title,
  rotation = 0,
  zoom = 1,
}: {
  url: string
  title: string
  rotation?: number
  zoom?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [viewerSize, setViewerSize] = useState<ViewerSize>({ width: 0, height: 0 })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      setViewerSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | null = null

    const loadDocument = async () => {
      try {
        setState('loading')
        setDocument(null)
        const pdfjs = await import(/* webpackIgnore: true */ pdfModuleSrc) as typeof import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
        loadingTask = pdfjs.getDocument({ url })
        const loadedDocument = await loadingTask.promise
        if (!active) {
          await loadedDocument.destroy()
          return
        }
        setDocument(loadedDocument)
        setState('ready')
      } catch (loadError) {
        if (active) {
          console.error('Load PDF failed:', loadError)
          setState('error')
        }
      }
    }

    void loadDocument()
    return () => {
      active = false
      void loadingTask?.destroy()
    }
  }, [url])

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto bg-slate-900" aria-label={title}>
      {state === 'loading' && (
        <div className="flex h-full items-center justify-center gap-3 text-sm text-white/70">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          正在打开 PDF
        </div>
      )}
      {state === 'error' && (
        <div className="flex h-full items-center justify-center text-sm text-red-200">PDF 打开失败，请使用“新窗口”查看原文件。</div>
      )}
      {state === 'ready' && document && viewerSize.width > 0 && viewerSize.height > 0 && (
        <div className="flex min-h-full flex-col">
          {Array.from({ length: document.numPages }, (_, index) => (
            <PdfPageCanvas
              key={`${document.fingerprints[0] || url}-${index + 1}`}
              document={document}
              pageNumber={index + 1}
              rotation={rotation}
              zoom={zoom}
              viewerSize={viewerSize}
            />
          ))}
        </div>
      )}
    </div>
  )
}
