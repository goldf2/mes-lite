'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Download, Eye, Sparkles } from 'lucide-react'
import { MAX_ATTACHMENT_FILE_SIZE, attachmentTypeLabel, type AttachmentPreviewKind } from '@/lib/attachment-file-types'
import { supportsDocumentSourceCredentialRecognition } from '@/lib/document-source-credentials'
import DocumentFileViewer from './DocumentFileViewer'
import DocumentPreviewThumb from './DocumentPreviewThumb'
import ModalDialog from './ModalDialog'

export interface ManagedAttachment {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  originalUrl?: string
  thumbnailUrl?: string
  displayUrl?: string
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  note?: string
  uploadedBy?: string
  isCover: boolean
  rotation?: number
  createdAt: string
}

interface AttachmentPanelProps {
  ownerType: string
  ownerId: string
  title?: string
  compact?: boolean
  variant?: 'document' | 'image'
  documentType?: string
  layout?: 'default' | 'gallery'
  allowCover?: boolean
  compactMode?: 'manage' | 'summary'
  enableAiRecognition?: boolean
  onAiRecognize?: (attachment: ManagedAttachment) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
  onMessage: (msg: string) => void
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentPanel({
  ownerType,
  ownerId,
  title = '附件管理',
  compact = false,
  variant = 'document',
  documentType = 'ORIGINAL',
  layout = 'default',
  allowCover = false,
  compactMode = 'manage',
  enableAiRecognition = false,
  onAiRecognize,
  onBusyChange,
  onMessage,
}: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<ManagedAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [recognizingAttachmentId, setRecognizingAttachmentId] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [note, setNote] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<ManagedAttachment | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageOnly = variant === 'image'
  const itemLabel = imageOnly ? '物料图片' : '附件'
  const showAiRecognition = !imageOnly && (
    enableAiRecognition || supportsDocumentSourceCredentialRecognition(ownerType, documentType)
  )

  const fetchAttachments = useCallback(async () => {
    const res = await fetch(`/api/attachments?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`)
    if (res.ok) {
      const data = await res.json()
      setAttachments(data.data || [])
    }
  }, [ownerId, ownerType])

  useEffect(() => {
    fetchAttachments()
  }, [fetchAttachments])

  useEffect(() => {
    onBusyChange?.(uploading || Boolean(recognizingAttachmentId))
  }, [onBusyChange, recognizingAttachmentId, uploading])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('ownerType', ownerType)
      form.append('ownerId', ownerId)
      form.append('documentType', documentType)
      if (note.trim()) form.append('note', note.trim())
      form.append('file', file)

      const res = await fetch('/api/attachments', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`${itemLabel}上传成功`)
        setNote('')
        await fetchAttachments()
      } else {
        onMessage(data.error || '上传失败')
      }
    } catch (error) {
      onMessage('上传失败')
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const openFilePicker = () => {
    if (!uploading) inputRef.current?.click()
  }

  const handleFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files)
    const acceptedFiles = selectedFiles.filter((file) => {
      if (imageOnly) return file.type.startsWith('image/')
      return file.size > 0 && file.size <= MAX_ATTACHMENT_FILE_SIZE
    })

    if (acceptedFiles.length === 0) {
      onMessage(imageOnly ? '请拖放图片文件' : '请选择 50 MB 以内的文件')
      return
    }

    for (const file of acceptedFiles) {
      await uploadFile(file)
    }
  }

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    if (uploading) return
    await handleFiles(event.dataTransfer.files)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!uploading) setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragActive(false)
  }

  const deleteAttachment = async (id: string) => {
    if (!confirm(`确定归档这张${itemLabel}吗？归档后文件仍会保留。`)) return
    const res = await fetch(`/api/attachments?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage(`${itemLabel}已归档`)
      await fetchAttachments()
    } else {
      onMessage(data.error || '归档失败')
    }
  }

  const setCover = async (id: string) => {
    const res = await fetch('/api/attachments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'SET_COVER' }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('物料封面已更新')
      await fetchAttachments()
    } else {
      onMessage(data.error || '设置封面失败')
    }
  }

  const handleAiRecognition = async (attachment?: ManagedAttachment) => {
    const sourceAttachment = attachment || attachments[0]
    if (!sourceAttachment) {
      onMessage('请先上传原始凭据，再进行 AI 识别')
      return
    }
    if (!onAiRecognize) {
      onMessage('AI 凭据识别入口已准备，识别与字段填充服务将在下一阶段接入')
      return
    }
    setRecognizingAttachmentId(sourceAttachment.id)
    try {
      await onAiRecognize(sourceAttachment)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'AI 凭据识别失败，请稍后重试')
    } finally {
      setRecognizingAttachmentId(null)
    }
  }

  if (compact) {
    if (compactMode === 'summary') {
      return (
        <div className="inline-flex min-w-[72px] items-center gap-2 text-xs text-gray-500" aria-label={`附件 ${attachments.length} 个`}>
          <span className="font-medium text-gray-700">附件</span>
          <span>{attachments.length} 个</span>
        </div>
      )
    }
    return (
      <div className="min-w-[150px] space-y-2">
        <div className="flex items-center gap-2">
          <label className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50 cursor-pointer whitespace-nowrap">
            {uploading ? '上传中' : imageOnly ? '上传图片' : '上传文件'}
            <input
              ref={inputRef}
              type="file"
              accept={imageOnly ? 'image/*' : undefined}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
              }}
            />
          </label>
          <span className="text-xs text-gray-500">{attachments.length} 个</span>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.previewUrl || attachment.originalUrl || attachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50 text-xs"
                title={attachment.originalName}
              >
                {attachment.mimeType.startsWith('image/') ? (
                  <img src={attachment.thumbnailUrl || attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
                ) : (
                  attachmentTypeLabel(attachment.originalName, attachment.mimeType)
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (layout === 'gallery') {
    return (
      <section className="border-t border-gray-200 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-xs text-gray-500">{attachments.length} 张图片，点击可查看原图</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center sm:justify-end">
            {imageOnly && (
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="填写图片说明"
                maxLength={200}
                className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm"
              />
            )}
            <label className="inline-flex justify-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 cursor-pointer whitespace-nowrap">
              {uploading ? '上传中...' : imageOnly ? '添加图片' : '添加附件'}
              <input
                ref={inputRef}
                type="file"
                accept={imageOnly ? 'image/*' : undefined}
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const files = e.target.files
                  if (files) handleFiles(files)
                }}
              />
            </label>
          </div>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openFilePicker()
            }
          }}
          role="button"
          tabIndex={uploading ? -1 : 0}
          aria-disabled={uploading}
          className={`mt-4 flex min-h-20 items-center justify-center rounded-md border border-dashed px-4 py-4 text-center text-sm transition ${
            dragActive
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-300 hover:bg-blue-50/50'
          } ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {uploading ? '上传中...' : imageOnly ? '拖放图片到这里，或点击添加图片' : '拖放文件到这里，或点击添加附件'}
        </div>

        {attachments.length === 0 ? (
          <div className="mt-4 flex min-h-32 items-center justify-center border border-dashed border-gray-300 rounded-md bg-white text-sm text-gray-500">
            {imageOnly ? '暂无物料图片' : '暂无附件'}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {attachments.map((attachment) => (
              <article key={attachment.id} className={`overflow-hidden rounded-md border bg-white ${attachment.isCover ? 'border-blue-500' : 'border-gray-200'}`}>
                <a
                  href={attachment.previewUrl || attachment.originalUrl || attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gray-100"
                >
                  {attachment.isCover && (
                    <span className="absolute left-2 top-2 z-10 rounded bg-blue-600 px-2 py-1 text-xs text-white">封面</span>
                  )}
                  {attachment.mimeType.startsWith('image/') ? (
                    <img src={attachment.thumbnailUrl || attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-gray-500">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)}</span>
                  )}
                </a>
                <div className="p-3">
                  <a href={attachment.previewUrl || attachment.originalUrl || attachment.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-gray-900">
                    {attachment.note || attachment.originalName}
                  </a>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{formatSize(attachment.size)}</span>
                    <div className="flex items-center gap-3">
                      {allowCover && !attachment.isCover && (
                        <button onClick={() => setCover(attachment.id)} className="text-blue-700 hover:text-blue-800">设为封面</button>
                      )}
                      <button onClick={() => deleteAttachment(attachment.id)} className="text-red-600 hover:text-red-700">归档</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <section className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {!imageOnly && <p className="mt-1 text-xs text-gray-500">原始凭证及补充文件的上传、预览、下载和归档统一在此管理。</p>}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {imageOnly && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="图片说明，如：正面外观、包装标签"
              maxLength={200}
              className="min-w-[220px] flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          )}
          {showAiRecognition && (
            <button
              type="button"
              onClick={() => void handleAiRecognition()}
              disabled={recognizingAttachmentId !== null}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 text-sm font-medium text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {recognizingAttachmentId ? '识别中' : 'AI 识别并填充'}
            </button>
          )}
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 whitespace-nowrap">
            {uploading ? '上传中...' : imageOnly ? '选择图片' : '添加附件'}
            <input
              ref={inputRef}
              type="file"
              accept={imageOnly ? 'image/*' : undefined}
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files
                if (files) handleFiles(files)
              }}
            />
          </label>
        </div>
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openFilePicker()
          }
        }}
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        className={`mb-3 flex min-h-20 items-center justify-center rounded-lg border border-dashed px-4 py-4 text-center text-sm transition ${
          dragActive
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-300 hover:bg-blue-50/50'
        } ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {uploading ? '上传中...' : imageOnly ? '拖放图片到这里，或点击选择图片' : '拖放原始凭证或补充文件到这里，或点击添加附件'}
      </div>
      {attachments.length === 0 ? (
        <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{imageOnly ? '暂无物料图片' : '暂无附件，可上传图片、PDF、Office 文档或其他业务文件'}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {attachments.map((attachment) => (
            <article key={attachment.id} className="flex min-w-0 gap-3 rounded-lg border border-gray-200 p-3">
              <button type="button" onClick={() => setPreviewAttachment(attachment)} className="w-24 flex-shrink-0" aria-label={`预览 ${attachment.originalName}`}>
                <DocumentPreviewThumb attachment={attachment} title={attachment.originalName} className="w-full" />
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setPreviewAttachment(attachment)} className="block max-w-full truncate text-left text-sm font-medium text-blue-700 hover:text-blue-800">
                  {attachment.originalName}
                </button>
                <div className="mt-1 text-xs text-gray-500">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)} · {formatSize(attachment.size)}</div>
                {attachment.note && <div className="mt-1 text-sm text-gray-700 break-words">{attachment.note}</div>}
                <div className="mt-1 text-xs text-gray-400">{new Date(attachment.createdAt).toLocaleString('zh-CN')}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" onClick={() => setPreviewAttachment(attachment)} className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800"><Eye aria-hidden="true" className="h-3.5 w-3.5" />预览</button>
                  <a href={`${attachment.originalUrl || attachment.url}?download=1`} className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"><Download aria-hidden="true" className="h-3.5 w-3.5" />下载</a>
                  {showAiRecognition && (
                    <button
                      type="button"
                      disabled={recognizingAttachmentId !== null}
                      onClick={() => void handleAiRecognition(attachment)}
                      className="text-violet-700 hover:text-violet-800 disabled:text-gray-400"
                    >
                      {recognizingAttachmentId === attachment.id ? '识别中' : 'AI 识别'}
                    </button>
                  )}
                  <button type="button" onClick={() => deleteAttachment(attachment.id)} className="text-red-600 hover:text-red-700">归档</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      </section>
      {previewAttachment && (
        <ModalDialog
          title={previewAttachment.originalName}
          description={`${attachmentTypeLabel(previewAttachment.originalName, previewAttachment.mimeType)} · ${formatSize(previewAttachment.size)}`}
          onClose={() => setPreviewAttachment(null)}
          size="wide"
          bodyClassName="!p-0 bg-slate-950"
          headerActions={(
            <a href={`${previewAttachment.originalUrl || previewAttachment.url}?download=1`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download aria-hidden="true" className="h-4 w-4" />下载
            </a>
          )}
        >
          <div className="h-[min(72dvh,760px)] bg-slate-950">
            <DocumentFileViewer attachment={previewAttachment} />
          </div>
        </ModalDialog>
      )}
    </>
  )
}
