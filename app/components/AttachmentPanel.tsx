'use client'

import { useEffect, useRef, useState } from 'react'

interface Attachment {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  note?: string
  uploadedBy?: string
  isCover: boolean
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
  title = '原始单据',
  compact = false,
  variant = 'document',
  documentType = 'ORIGINAL',
  layout = 'default',
  allowCover = false,
  onMessage,
}: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageOnly = variant === 'image'
  const itemLabel = imageOnly ? '物料图片' : '原始单据'

  useEffect(() => {
    fetchAttachments()
  }, [ownerType, ownerId])

  const fetchAttachments = async () => {
    const res = await fetch(`/api/attachments?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`)
    if (res.ok) {
      const data = await res.json()
      setAttachments(data.data || [])
    }
  }

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

  const deleteAttachment = async (id: string) => {
    if (!confirm(`确定删除这张${itemLabel}吗？`)) return
    const res = await fetch(`/api/attachments?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage(`${itemLabel}已删除`)
      await fetchAttachments()
    } else {
      onMessage(data.error || '删除失败')
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

  if (compact) {
    return (
      <div className="min-w-[150px] space-y-2">
        <div className="flex items-center gap-2">
          <label className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50 cursor-pointer whitespace-nowrap">
            {uploading ? '上传中' : imageOnly ? '上传图片' : '上传照片'}
            <input
              ref={inputRef}
              type="file"
              accept={imageOnly ? 'image/*' : 'image/*,application/pdf'}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
              }}
            />
          </label>
          <span className="text-xs text-gray-500">{attachments.length} 张</span>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50 text-xs"
                title={attachment.originalName}
              >
                {attachment.mimeType.startsWith('image/') ? (
                  <img src={attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
                ) : (
                  'PDF'
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
                accept={imageOnly ? 'image/*' : 'image/*,application/pdf'}
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadFile(file)
                }}
              />
            </label>
          </div>
        </div>

        {attachments.length === 0 ? (
          <div className="mt-4 flex min-h-32 items-center justify-center border border-dashed border-gray-300 rounded-md bg-gray-50 text-sm text-gray-500">
            {imageOnly ? '暂无物料图片' : '暂无附件'}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {attachments.map((attachment) => (
              <article key={attachment.id} className={`overflow-hidden rounded-md border bg-white ${attachment.isCover ? 'border-blue-500' : 'border-gray-200'}`}>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gray-100"
                >
                  {attachment.isCover && (
                    <span className="absolute left-2 top-2 z-10 rounded bg-blue-600 px-2 py-1 text-xs text-white">封面</span>
                  )}
                  {attachment.mimeType.startsWith('image/') ? (
                    <img src={attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-gray-500">PDF</span>
                  )}
                </a>
                <div className="p-3">
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-gray-900">
                    {attachment.note || attachment.originalName}
                  </a>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{formatSize(attachment.size)}</span>
                    <div className="flex items-center gap-3">
                      {allowCover && !attachment.isCover && (
                        <button onClick={() => setCover(attachment.id)} className="text-blue-700 hover:text-blue-800">设为封面</button>
                      )}
                      <button onClick={() => deleteAttachment(attachment.id)} className="text-red-600 hover:text-red-700">删除</button>
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
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">{title}</h3>
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
          <label className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer whitespace-nowrap">
            {uploading ? '上传中...' : imageOnly ? '选择图片' : '上传照片/PDF'}
            <input
              ref={inputRef}
              type="file"
              accept={imageOnly ? 'image/*' : 'image/*,application/pdf'}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
              }}
            />
          </label>
        </div>
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-gray-500">{imageOnly ? '暂无物料图片' : '暂无原始单据照片'}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex gap-3 border border-gray-100 rounded-lg p-2">
              <a href={attachment.url} target="_blank" rel="noreferrer" className="h-16 w-16 flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50 text-xs flex items-center justify-center">
                {attachment.mimeType.startsWith('image/') ? (
                  <img src={attachment.url} alt={attachment.originalName} className="h-full w-full object-cover" />
                ) : (
                  'PDF'
                )}
              </a>
              <div className="min-w-0 flex-1">
                <a href={attachment.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-700">
                  {attachment.originalName}
                </a>
                <div className="text-xs text-gray-500">{formatSize(attachment.size)}</div>
                {attachment.note && <div className="mt-1 text-sm text-gray-700 break-words">{attachment.note}</div>}
                <div className="text-xs text-gray-400">{new Date(attachment.createdAt).toLocaleString('zh-CN')}</div>
                <button
                  onClick={() => deleteAttachment(attachment.id)}
                  className="mt-1 text-xs text-red-600 hover:text-red-700"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
