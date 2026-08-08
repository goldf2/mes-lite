'use client'

import AttachmentPanel, { type ManagedAttachment } from './AttachmentPanel'
import {
  draftDocumentAttachmentOwnerType,
  type DocumentSourceCredentialOwnerType,
} from '@/lib/draft-document-attachments'

export function createDraftDocumentAttachmentId() {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `draft-${suffix}`
}

export async function finalizeDraftDocumentAttachments({
  ownerType,
  draftOwnerId,
  targetOwnerId,
}: {
  ownerType: DocumentSourceCredentialOwnerType
  draftOwnerId: string
  targetOwnerId: string
}) {
  if (!draftOwnerId) return 0
  const response = await fetch('/api/attachments/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerType, draftOwnerId, targetOwnerId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '暂存附件绑定失败')
  return Number(data.count || 0)
}

export async function discardDraftDocumentAttachments(
  ownerType: DocumentSourceCredentialOwnerType,
  draftOwnerId: string,
) {
  if (!draftOwnerId) return
  const params = new URLSearchParams({ ownerType, draftOwnerId })
  await fetch(`/api/attachments/drafts?${params}`, { method: 'DELETE' })
}

export default function DraftDocumentAttachmentPanel({
  ownerType,
  draftOwnerId,
  onMessage,
  onRecognized,
  onBusyChange,
}: {
  ownerType: DocumentSourceCredentialOwnerType
  draftOwnerId: string
  onMessage: (message: string) => void
  onRecognized?: (fields: Record<string, unknown>) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
}) {
  if (!draftOwnerId) {
    return <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">正在准备附件暂存区…</div>
  }

  const recognize = async (attachment: ManagedAttachment) => {
    const response = await fetch('/api/ai/document-recognition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId: attachment.id, ownerType, ownerId: draftOwnerId }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'AI 凭据识别失败')
    await onRecognized?.(data.data?.fields || {})
    onMessage(data.message || 'AI 识别完成，请人工核对回填字段')
  }

  return (
    <section className="space-y-2 border-t border-gray-100 pt-5">
      <AttachmentPanel
        ownerType={draftDocumentAttachmentOwnerType(ownerType)}
        ownerId={draftOwnerId}
        title="原始凭据与附件"
        enableAiRecognition
        onAiRecognize={recognize}
        onBusyChange={onBusyChange}
        onMessage={onMessage}
      />
      <p className="px-1 text-xs text-gray-500">可在保存前预览和 AI 识别；创建成功后自动绑定，取消新建时自动清理。</p>
    </section>
  )
}
