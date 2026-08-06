'use client'

import { Download, FileText } from 'lucide-react'
import { attachmentPreviewKind, attachmentTypeLabel, type AttachmentPreviewKind } from '@/lib/attachment-file-types'
import PdfDocumentViewer from './PdfDocumentViewer'

export interface ViewableAttachment {
  id: string
  originalName: string
  mimeType: string
  url: string
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  rotation?: number
}

export default function DocumentFileViewer({
  attachment,
  zoom = 1,
}: {
  attachment: ViewableAttachment
  zoom?: number
}) {
  const kind = attachment.previewKind || attachmentPreviewKind(attachment.originalName, attachment.mimeType)
  const previewUrl = attachment.previewUrl || `/api/attachments/${attachment.id}/preview`

  if (kind === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
        <img
          src={attachment.url}
          alt={attachment.originalName}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `rotate(${attachment.rotation || 0}deg) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    )
  }

  if (kind === 'pdf' || kind === 'office') {
    return (
      <PdfDocumentViewer
        url={kind === 'office' ? previewUrl : attachment.url}
        title={attachment.originalName}
        rotation={attachment.rotation}
        zoom={zoom}
      />
    )
  }

  if (kind === 'text') {
    return (
      <iframe
        src={previewUrl}
        title={attachment.originalName}
        className="h-full w-full border-0 bg-white"
        sandbox=""
      />
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-white/75">
      <FileText className="h-16 w-16 text-white/40" />
      <div>
        <div className="text-base font-semibold text-white">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)} 暂无内嵌预览</div>
        <div className="mt-1 text-sm text-white/60">文件已安全保存，可以下载后使用本机应用打开。</div>
      </div>
      <a href={`${attachment.url}?download=1`} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900">
        <Download className="h-4 w-4" />下载原文件
      </a>
    </div>
  )
}
