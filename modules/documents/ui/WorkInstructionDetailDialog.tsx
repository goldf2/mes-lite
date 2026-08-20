'use client'

import type { DragEvent, RefObject } from 'react'
import ModalDialog from '@/app/components/ModalDialog'
import AppButton from '@/app/components/AppButton'
import { DocumentFileViewer, DocumentPreviewThumb, RegenerateAttachmentPreviewButton } from '@/modules/attachments'
import OnlineDocumentEditor from './OnlineDocumentEditor'
import { attachmentTypeLabel } from '@/lib/attachment-file-types'
import type {
  AttachmentItem,
  MaterialOption,
  WorkCenterOption,
  WorkInstruction,
  WorkInstructionForm,
} from '../contracts/work-instruction'
import {
  formatFileSize,
  formatInstructionDate,
  getInstructionCategoryLabel,
  getInstructionCustomerName,
  getInstructionScopeLabel,
  statusLabels,
} from '../model/work-instruction-view'
import WorkInstructionFormFields from './WorkInstructionFormFields'
import { InstructionBadge } from './WorkInstructionCollectionView'

interface WorkInstructionDetailDialogProps {
  detail: WorkInstruction
  editing: boolean
  form: WorkInstructionForm
  onFormChange: (form: WorkInstructionForm) => void
  materials: MaterialOption[]
  selectedMaterial?: MaterialOption | null
  onMaterialSearch: (keyword: string) => void | Promise<void>
  categoryOptions: { value: string; label: string; keywords?: string }[]
  workCenters: WorkCenterOption[]
  attachments: AttachmentItem[]
  selectedAttachment: AttachmentItem | null
  selectedAttachmentIndex: number
  onSelectAttachment: (id: string) => void
  loading: boolean
  uploading: boolean
  dragActive: boolean
  focusUploadOnOpen: boolean
  uploadInputRef: RefObject<HTMLInputElement>
  uploadAreaRef: RefObject<HTMLDivElement>
  onDragActiveChange: (active: boolean) => void
  onFiles: (files: FileList | File[]) => void
  onClose: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onOpenViewer: (index: number) => void
  onArchiveAttachment: (attachment: AttachmentItem) => void
  onPreviewRegenerated: (attachmentId: string, revision: number) => void
  onMessage: (message: string) => void
  canRegeneratePreviews: boolean
}

export default function WorkInstructionDetailDialog({
  detail,
  editing,
  form,
  onFormChange,
  materials,
  selectedMaterial,
  onMaterialSearch,
  categoryOptions,
  workCenters,
  attachments,
  selectedAttachment,
  selectedAttachmentIndex,
  onSelectAttachment,
  loading,
  uploading,
  dragActive,
  focusUploadOnOpen,
  uploadInputRef,
  uploadAreaRef,
  onDragActiveChange,
  onFiles,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSave,
  onOpenViewer,
  onArchiveAttachment,
  onPreviewRegenerated,
  onMessage,
  canRegeneratePreviews,
}: WorkInstructionDetailDialogProps) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onDragActiveChange(false)
    if (!uploading) onFiles(event.dataTransfer.files)
  }

  return (
    <ModalDialog
      title={detail.title}
      description={getInstructionScopeLabel(detail)}
      size="wide"
      panelClassName="lg:max-w-[1440px]"
      bodyClassName="p-4 sm:p-6"
      onClose={onClose}
      headerActions={<AppButton variant="secondary" size="sm" onClick={editing ? onCancelEdit : onStartEdit}>{editing ? '退出编辑' : '编辑文档'}</AppButton>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section className={`${editing ? 'order-1' : 'order-2'} space-y-3 lg:order-1`}>
          {editing ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
              <div className="mb-3 text-sm font-semibold text-gray-900">基础信息</div>
              <WorkInstructionFormFields
                form={form}
                onChange={onFormChange}
                materials={materials}
                selectedMaterial={selectedMaterial}
                onMaterialSearch={onMaterialSearch}
                categoryOptions={categoryOptions}
                workCenters={workCenters}
                mode="detail"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={onCancelEdit} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
                <button onClick={onSave} disabled={loading} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{loading ? '保存中...' : '保存信息'}</button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap gap-2">
                <InstructionBadge>{getInstructionCategoryLabel(detail)}</InstructionBadge>
                <InstructionBadge tone={detail.status === 'ACTIVE' ? 'green' : detail.status === 'DRAFT' ? 'amber' : 'gray'}>{statusLabels[detail.status] || detail.status}</InstructionBadge>
                <InstructionBadge tone="blue">{detail.version}</InstructionBadge>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <div>客户：{getInstructionCustomerName(detail)}</div>
                <div>产品：{detail.material ? `${detail.material.code} · ${detail.material.name}` : '未绑定'}</div>
                {detail.material?.spec && <div>规格：{detail.material.spec}</div>}
                <div>工作中心：{detail.workCenters.length > 0 ? detail.workCenters.map((item) => `${item.code} · ${item.name}`).join('、') : '不限'}</div>
                <div>创建时间：{formatInstructionDate(detail.createdAt)}</div>
              </div>
              {detail.note && <div className="mt-4 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{detail.note}</div>}
            </div>
          )}

          <input ref={uploadInputRef} type="file" multiple disabled={uploading} className="hidden" onChange={(event) => event.target.files && onFiles(event.target.files)} />
          {attachments.length > 0 && !focusUploadOnOpen ? (
            <div ref={uploadAreaRef} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">已上传 {attachments.length} 个附件</div>
                <div className="mt-1 text-xs text-gray-500">上传完成后在右侧展示新附件。</div>
              </div>
              <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading} className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{uploading ? '上传中...' : '添加附件'}</button>
            </div>
          ) : (
            <div ref={uploadAreaRef} className="rounded-lg border-2 border-dashed border-green-300 bg-green-50/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">上传文档附件</h4>
                  <p className="mt-1 text-xs text-gray-500">支持 Word、Excel、PowerPoint、PDF、图片及其他附件，可一次选择多个文件。</p>
                </div>
                <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading} className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{uploading ? '上传中...' : '选择文件'}</button>
              </div>
              <div
                onDrop={handleDrop}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!uploading) onDragActiveChange(true) }}
                onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (!uploading) onDragActiveChange(true) }}
                onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragActiveChange(false) }}
                onClick={() => !uploading && uploadInputRef.current?.click()}
                className={`flex min-h-28 cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 py-4 text-center text-sm transition ${dragActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-300 hover:bg-blue-50/50'} ${uploading ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {uploading ? '上传中...' : '拖放文件到这里，或点击选择文件'}
              </div>
            </div>
          )}
        </section>

        <section className={`${editing ? 'order-2' : 'order-1'} min-w-0 space-y-5 lg:order-2`}>
          {selectedAttachment ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-500">附件预览 · {selectedAttachmentIndex + 1}/{attachments.length}</div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{selectedAttachment.originalName}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => onOpenViewer(selectedAttachmentIndex)} className="rounded-md border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50">全屏预览</button>
                  {canRegeneratePreviews && (
                    <RegenerateAttachmentPreviewButton
                      attachment={selectedAttachment}
                      onMessage={onMessage}
                      onRegenerated={(revision) => onPreviewRegenerated(selectedAttachment.id, revision)}
                    />
                  )}
                  <a href={`${selectedAttachment.url}?download=1`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">下载原文件</a>
                </div>
              </div>
              <div className="h-[min(58vh,640px)] min-h-[360px] bg-slate-950"><DocumentFileViewer attachment={selectedAttachment} /></div>
            </div>
          ) : !editing && !detail.contentText ? (
            <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">上传附件后将在这里直接预览</div>
          ) : null}

          {(editing || Boolean(detail.contentText)) && <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">在线正文</h4>
              <span className="text-xs text-gray-500">{editing ? '编辑模式' : detail.contentText ? '可在线阅读' : '暂无正文'}</span>
            </div>
            <OnlineDocumentEditor value={editing ? form.contentJson : detail.contentJson} onChange={editing ? (contentJson) => onFormChange({ ...form, contentJson }) : undefined} editable={editing} minHeight="20rem" />
          </div>}

          <div>
            <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-900">全部附件</h4><span className="text-xs text-gray-500">{attachments.length} 个文件</span></div>
            {attachments.length === 0 ? (
              <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">暂无附件</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {attachments.map((attachment) => (
                  <article key={attachment.id} className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 transition ${attachment.id === selectedAttachment?.id ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                    <button type="button" onClick={() => onSelectAttachment(attachment.id)} aria-pressed={attachment.id === selectedAttachment?.id} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <DocumentPreviewThumb attachment={attachment} title={detail.title} className="w-20 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{attachment.originalName}</span>
                        <span className="mt-1 block text-xs text-gray-500">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)} · {formatFileSize(attachment.size)} · {formatInstructionDate(attachment.createdAt)}</span>
                      </span>
                    </button>
                    <button onClick={() => onArchiveAttachment(attachment)} className="shrink-0 rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </ModalDialog>
  )
}
