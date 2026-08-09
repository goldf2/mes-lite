'use client'

import DocumentFileViewer from '@/app/components/DocumentFileViewer'
import { attachmentPreviewKind } from '@/lib/attachment-file-types'
import type { AttachmentItem, WorkInstruction } from '../contracts/work-instruction'

export interface WorkInstructionViewerState {
  instruction: WorkInstruction
  attachments: AttachmentItem[]
  index: number
}

interface WorkInstructionFullscreenViewerProps {
  viewer: WorkInstructionViewerState
  attachment: AttachmentItem
  zoom: number
  rotationSaving: boolean
  onNavigate: (index: number) => void
  onZoomChange: (zoom: number) => void
  onRotate: (delta: number) => void
  onClose: () => void
}

export default function WorkInstructionFullscreenViewer({
  viewer,
  attachment,
  zoom,
  rotationSaving,
  onNavigate,
  onZoomChange,
  onRotate,
  onClose,
}: WorkInstructionFullscreenViewerProps) {
  const previewKind = attachmentPreviewKind(attachment.originalName, attachment.mimeType)
  const transformable = previewKind !== 'text' && previewKind !== 'none'

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{viewer.instruction.title}</div>
          <div className="truncate text-xs text-white/60">{attachment.originalName} · {viewer.index + 1}/{viewer.attachments.length}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => onNavigate(Math.max(0, viewer.index - 1))} disabled={viewer.index <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
          <button onClick={() => onNavigate(Math.min(viewer.attachments.length - 1, viewer.index + 1))} disabled={viewer.index >= viewer.attachments.length - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
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
      {['pdf', 'office'].includes(previewKind) && (
        <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
          多页文档可纵向滚动；Office 文件首次打开时由服务器生成 PDF 预览，原文件保持不变。
        </div>
      )}
    </div>
  )
}
