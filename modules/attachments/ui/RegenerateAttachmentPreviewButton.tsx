'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { attachmentPreviewKind, type AttachmentPreviewKind } from '@/lib/attachment-file-types'
import { regenerateAttachmentPreview } from '../client/attachment-api'

type RegeneratableAttachment = {
  id: string
  originalName: string
  mimeType: string
  previewKind?: AttachmentPreviewKind
}

export default function RegenerateAttachmentPreviewButton({
  attachment,
  onMessage,
  onRegenerated,
}: {
  attachment: RegeneratableAttachment
  onMessage: (message: string) => void
  onRegenerated?: (revision: number) => void | Promise<void>
}) {
  const [regenerating, setRegenerating] = useState(false)
  const previewKind = attachment.previewKind || attachmentPreviewKind(attachment.originalName, attachment.mimeType)
  if (previewKind !== 'cad') return null

  const regenerate = async () => {
    if (regenerating) return
    setRegenerating(true)
    try {
      const message = await regenerateAttachmentPreview(attachment.id)
      await onRegenerated?.(Date.now())
      onMessage(message)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '重新生成 CAD 预览失败')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <AppButton
      variant="secondary"
      size="sm"
      disabled={regenerating}
      onClick={() => void regenerate()}
      title="重新读取原始图纸并生成 PDF 与缩略图，原文件不会修改"
    >
      <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
      {regenerating ? '转换中' : '重新生成预览'}
    </AppButton>
  )
}
