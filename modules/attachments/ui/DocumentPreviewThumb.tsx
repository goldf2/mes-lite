'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { attachmentPreviewKind, attachmentTypeLabel, type AttachmentPreviewKind } from '@/lib/attachment-file-types'

export interface PreviewAttachment {
  id: string
  originalName: string
  mimeType: string
  url: string
  thumbnailUrl?: string | null
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  note?: string | null
  rotation?: number
}

function StoredDocumentPreview({
  attachment,
  title,
}: {
  attachment: PreviewAttachment
  title: string
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const thumbnailUrl = attachment.thumbnailUrl
    || `/api/attachments/${attachment.id}/thumbnail?v=${Number(attachment.rotation || 0)}`

  useEffect(() => {
    setState('loading')
  }, [thumbnailUrl])

  return (
    <>
      <img
        src={thumbnailUrl}
        alt={attachment.note || `${title} · ${attachment.originalName}`}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={`h-full w-full bg-white object-contain ${state === 'ready' ? 'block' : 'hidden'}`}
      />
      {state === 'loading' && (
        <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          正在读取缩略图
        </div>
      )}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-1 text-red-700">
          <span className="text-base font-semibold">
            {attachmentTypeLabel(attachment.originalName, attachment.mimeType)}
          </span>
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
  const previewKind = attachment
    ? attachment.previewKind || attachmentPreviewKind(attachment.originalName, attachment.mimeType)
    : 'none'
  return (
    <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 ${className}`}>
      {attachment ? (
        previewKind === 'image' || previewKind === 'pdf' || previewKind === 'office' || previewKind === 'cad' ? (
          <StoredDocumentPreview attachment={attachment} title={title} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-gray-500">
            <FileText className="h-8 w-8 text-gray-400" />
            <span className="text-sm font-medium">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)}</span>
            <span className="text-xs">{previewKind === 'text' ? '打开后可预览正文' : '可下载原文件'}</span>
          </div>
        )
      ) : (
        <span className="text-sm text-gray-400">暂无文件</span>
      )}
    </div>
  )
}
