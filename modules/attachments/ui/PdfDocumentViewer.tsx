'use client'

import { useRef, useEffect, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'
import {
  buildPageFallbackSections,
  buildPdfSections,
  type PdfSection,
  type PdfSectionStart,
} from '../model/pdf-navigation'

const pdfModuleSrc = '/pdfjs/pdf.mjs'
const pdfWorkerSrc = '/pdfjs/pdf.worker.min.mjs'

type ViewerSize = {
  width: number
  height: number
}

type PdfOutlineItem = {
  title: string
  dest: string | unknown[] | null
  items: PdfOutlineItem[]
}

function flattenOutline(items: PdfOutlineItem[]): PdfOutlineItem[] {
  return items.flatMap((item) => [item, ...flattenOutline(item.items || [])])
}

async function resolveOutlineSections(document: PDFDocumentProxy) {
  const outline = await document.getOutline() as unknown as PdfOutlineItem[] | null
  if (!outline?.length) return []

  const starts = await Promise.all(flattenOutline(outline).map(async (item): Promise<PdfSectionStart | null> => {
    try {
      const destination = typeof item.dest === 'string'
        ? await document.getDestination(item.dest)
        : item.dest
      if (!Array.isArray(destination) || !destination[0]) return null
      const pageIndex = typeof destination[0] === 'number'
        ? destination[0]
        : await document.getPageIndex(destination[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0])
      return { title: item.title, pageNumber: pageIndex + 1 }
    } catch {
      return null
    }
  }))

  return buildPdfSections(starts.filter((item): item is PdfSectionStart => item !== null), document.numPages)
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
  sheetNavigation = false,
}: {
  url: string
  title: string
  rotation?: number
  zoom?: number
  sheetNavigation?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [viewerSize, setViewerSize] = useState<ViewerSize>({ width: 0, height: 0 })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [sections, setSections] = useState<PdfSection[]>([])
  const [selectedSection, setSelectedSection] = useState(0)
  const [usesSheetOutline, setUsesSheetOutline] = useState(false)

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
        setSections([])
        setSelectedSection(0)
        setUsesSheetOutline(false)
        const pdfjs = await import(/* webpackIgnore: true */ pdfModuleSrc) as typeof import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
        loadingTask = pdfjs.getDocument({ url })
        const loadedDocument = await loadingTask.promise
        if (!active) {
          await loadedDocument.destroy()
          return
        }
        if (sheetNavigation) {
          const outlineSections = await resolveOutlineSections(loadedDocument)
          setUsesSheetOutline(outlineSections.length > 0)
          setSections(outlineSections.length > 0 ? outlineSections : buildPageFallbackSections(loadedDocument.numPages))
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
  }, [sheetNavigation, url])

  const activeSection = sheetNavigation ? sections[selectedSection] : null
  const visiblePages = document
    ? Array.from(
      { length: activeSection ? activeSection.endPageNumber - activeSection.pageNumber + 1 : document.numPages },
      (_, index) => (activeSection?.pageNumber || 1) + index,
    )
    : []
  const navigateToSection = (index: number) => {
    setSelectedSection(Math.max(0, Math.min(sections.length - 1, index)))
    containerRef.current?.scrollTo({ top: 0 })
  }
  const navigationLabel = usesSheetOutline ? '工作表' : '页'

  return (
    <div className="flex h-full w-full flex-col bg-slate-900" aria-label={title}>
      {state === 'ready' && sheetNavigation && activeSection && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
          <button
            type="button"
            aria-label={`上一${navigationLabel}`}
            onClick={() => navigateToSection(selectedSection - 1)}
            disabled={selectedSection === 0}
            className="rounded border border-white/20 px-2.5 py-1.5 disabled:opacity-40"
          >
            <span aria-hidden="true" className="hidden sm:inline">上一{navigationLabel}</span>
            <span aria-hidden="true" className="sm:hidden">{usesSheetOutline ? '上一表' : '上一页'}</span>
          </button>
          <label className="order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
            <span className="sr-only">选择{navigationLabel}</span>
            <select
              value={selectedSection}
              onChange={(event) => navigateToSection(Number(event.target.value))}
              className="h-9 w-full rounded border border-white/20 bg-slate-900 px-3 text-sm text-white outline-none focus:border-blue-400"
            >
              {sections.map((section, index) => (
                <option key={`${section.pageNumber}-${section.title}`} value={index}>{index + 1}. {section.title}</option>
              ))}
            </select>
          </label>
          <span className="shrink-0 text-xs text-white/60">{selectedSection + 1}/{sections.length}</span>
          <button
            type="button"
            aria-label={`下一${navigationLabel}`}
            onClick={() => navigateToSection(selectedSection + 1)}
            disabled={selectedSection >= sections.length - 1}
            className="rounded border border-white/20 px-2.5 py-1.5 disabled:opacity-40"
          >
            <span aria-hidden="true" className="hidden sm:inline">下一{navigationLabel}</span>
            <span aria-hidden="true" className="sm:hidden">{usesSheetOutline ? '下一表' : '下一页'}</span>
          </button>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" aria-live="polite">
        {state === 'loading' && (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-white/70">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {sheetNavigation ? '正在打开工作簿' : '正在打开 PDF'}
          </div>
        )}
        {state === 'error' && (
          <div className="flex h-full items-center justify-center text-sm text-red-200">{sheetNavigation ? '表格预览' : 'PDF'}打开失败，请下载原文件查看。</div>
        )}
        {state === 'ready' && document && viewerSize.width > 0 && viewerSize.height > 0 && (
          <div className="flex min-h-full flex-col">
            {visiblePages.map((pageNumber) => (
              <PdfPageCanvas
                key={`${document.fingerprints[0] || url}-${pageNumber}`}
                document={document}
                pageNumber={pageNumber}
                rotation={rotation}
                zoom={zoom}
                viewerSize={viewerSize}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
