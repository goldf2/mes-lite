'use client'

import ModalOverlay from '@/app/components/ModalOverlay'
import { DocumentFileViewer } from '@/modules/attachments'
import { attachmentPreviewKind } from '@/lib/attachment-file-types'
import type { PanoramaViewerState } from '../../contracts/material-panorama'
import { formatSize } from '../../model/material-panorama-view'

export default function MaterialPanoramaViewer({ viewer, zoom, rotationSaving, onViewerChange, onZoomChange, onRotate, onClose }: {
  viewer: PanoramaViewerState
  zoom: number
  rotationSaving: boolean
  onViewerChange: (viewer: PanoramaViewerState) => void
  onZoomChange: (zoom: number) => void
  onRotate: (delta: number) => void
  onClose: () => void
}) {
  const attachment = viewer.attachments[viewer.index]
  if (!attachment) return null
  const previewKind = attachmentPreviewKind(attachment.originalName, attachment.mimeType)
  const transformable = previewKind !== 'text' && previewKind !== 'none'
  return (
    <ModalOverlay onClose={onClose} className="!z-[300] !bg-slate-950 !p-0 !backdrop-blur-none">
      <section role="dialog" aria-modal="true" aria-label="物料附件全屏预览" tabIndex={-1} className="flex h-[100dvh] w-full flex-col bg-slate-950 text-white">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{viewer.instruction.material.code} · {viewer.instruction.material.name}</div><div className="truncate text-xs text-white/60">{attachment.originalName} · {formatSize(attachment.size)} · {viewer.index + 1}/{viewer.attachments.length}</div></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => onViewerChange({ ...viewer, index: Math.max(0, viewer.index - 1) })} disabled={viewer.index <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
            <button onClick={() => onViewerChange({ ...viewer, index: Math.min(viewer.attachments.length - 1, viewer.index + 1) })} disabled={viewer.index >= viewer.attachments.length - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
            {transformable && <>
              <button onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
              <button onClick={() => onZoomChange(Math.min(4, Number((zoom + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
              <button onClick={() => onRotate(-90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">左转并保存</button>
              <button onClick={() => onRotate(90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">右转并保存</button>
              <button onClick={() => onZoomChange(1)} className="rounded border border-white/20 px-3 py-1.5 text-sm">适合页面</button>
            </>}
            <a href={`${attachment.url}?download=1`} className="rounded border border-white/20 px-3 py-1.5 text-sm">下载原文件</a>
            <button onClick={onClose} className="rounded bg-white px-3 py-1.5 text-sm text-slate-900">关闭</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden"><DocumentFileViewer attachment={attachment} zoom={zoom} /></div>
        {['pdf', 'office'].includes(previewKind) && <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">多页文档可纵向滚动；Office 文件首次打开时由服务器生成 PDF 预览，原文件保持不变。</div>}
      </section>
    </ModalOverlay>
  )
}
