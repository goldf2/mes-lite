'use client'

import ModalOverlay from '@/app/components/ModalOverlay'
import { DocumentFileViewer } from '@/modules/attachments'
import { attachmentPreviewHint, attachmentPreviewKind } from '@/lib/attachment-file-types'
import type { AttachmentItem, WorkInstruction } from '../contracts/work-instruction'
import OnlineDocumentEditor from './OnlineDocumentEditor'

export interface WorkInstructionViewerState {
  instruction: WorkInstruction
  attachments: AttachmentItem[]
  index: number
}

interface WorkInstructionFullscreenViewerProps {
  viewer: WorkInstructionViewerState
  attachment: AttachmentItem | null
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
  const showingContent = viewer.index === -1
  const previewKind = attachment ? attachmentPreviewKind(attachment.originalName, attachment.mimeType) : 'none'
  const previewHint = attachment ? attachmentPreviewHint(attachment.originalName, attachment.mimeType) : ''
  const transformable = Boolean(attachment) && previewKind !== 'text' && previewKind !== 'none'
  const hasContent = Boolean(viewer.instruction.contentText)
  const totalEntries = viewer.attachments.length + (hasContent ? 1 : 0)
  const currentPosition = showingContent ? 0 : viewer.index + (hasContent ? 1 : 0)
  const indexForPosition = (position: number) => hasContent ? position - 1 : position

  return (
    <ModalOverlay onClose={onClose} className="!z-[300] !bg-slate-950 !p-0 !backdrop-blur-none">
      <section role="dialog" aria-modal="true" aria-label="文档全屏预览" tabIndex={-1} className="flex h-[100dvh] w-full flex-col bg-slate-950 text-white">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{viewer.instruction.title}</div>
            <div className="truncate text-xs text-white/60">{showingContent ? '在线正文' : attachment?.originalName} · {currentPosition + 1}/{totalEntries}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => onNavigate(indexForPosition(Math.max(0, currentPosition - 1)))} disabled={currentPosition <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
            <button onClick={() => onNavigate(indexForPosition(Math.min(totalEntries - 1, currentPosition + 1)))} disabled={currentPosition >= totalEntries - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
            {transformable && <>
              <button onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
              <button onClick={() => onZoomChange(Math.min(4, Number((zoom + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
              <button onClick={() => onRotate(-90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">左转并保存</button>
              <button onClick={() => onRotate(90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">右转并保存</button>
              <button onClick={() => onZoomChange(1)} className="rounded border border-white/20 px-3 py-1.5 text-sm">适合页面</button>
            </>}
            {attachment && <a href={`${attachment.url}?download=1`} className="rounded border border-white/20 px-3 py-1.5 text-sm">下载原文件</a>}
            <button onClick={onClose} className="rounded bg-white px-3 py-1.5 text-sm text-slate-900">关闭</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {showingContent ? (
            <div className="mx-auto min-h-full max-w-5xl bg-white p-4 text-gray-900 sm:p-8">
              <OnlineDocumentEditor value={viewer.instruction.contentJson} editable={false} minHeight="calc(100dvh - 8rem)" />
            </div>
          ) : attachment ? <DocumentFileViewer attachment={attachment} zoom={zoom} /> : null}
        </div>
        {previewHint && (
          <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
            {previewHint}
          </div>
        )}
      </section>
    </ModalOverlay>
  )
}
