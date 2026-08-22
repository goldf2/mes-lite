'use client'

import type { DragEvent, RefObject } from 'react'
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import type { MaterialOption, WorkInstructionForm } from '../contracts/work-instruction'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import { formatFileSize } from '../model/work-instruction-view'
import WorkInstructionFormFields from './WorkInstructionFormFields'

interface WorkInstructionCreateDialogProps {
  form: WorkInstructionForm
  onFormChange: (form: WorkInstructionForm) => void
  materials: MaterialOption[]
  selectedMaterial?: MaterialOption | null
  onMaterialSearch: (keyword: string) => void | Promise<void>
  categoryOptions: { value: string; label: string; keywords?: string }[]
  fieldDefinitions: DocumentFieldDefinitionRecord[]
  files: File[]
  loading: boolean
  dragActive: boolean
  onDragActiveChange: (active: boolean) => void
  onSelectFiles: (files: FileList | File[]) => void
  onRemoveFile: (file: File) => void
  inputRef: RefObject<HTMLInputElement>
  onClose: () => void
  onSubmit: () => void
}

export default function WorkInstructionCreateDialog({
  form,
  onFormChange,
  materials,
  selectedMaterial,
  onMaterialSearch,
  categoryOptions,
  fieldDefinitions,
  files,
  loading,
  dragActive,
  onDragActiveChange,
  onSelectFiles,
  onRemoveFile,
  inputRef,
  onClose,
  onSubmit,
}: WorkInstructionCreateDialogProps) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onDragActiveChange(false)
    if (!loading) onSelectFiles(event.dataTransfer.files)
  }

  return (
    <ModalDialog
      title="新建文档"
      description="上传原始文件或编辑在线正文。"
      onClose={onClose}
      closeDisabled={loading}
      size="xl"
      footer={<ModalActions onCancel={onClose} onConfirm={onSubmit} confirmLabel={files.length > 0 ? '保存并上传' : '保存文档'} busy={loading} />}
    >
      <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">原始文件（可选）</h4>
            <p className="mt-1 text-xs text-gray-500">支持 Word、Excel、PowerPoint、PDF、图片及其他附件，单个文件不超过 50 MB。</p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" />选择文件
          </button>
          <input ref={inputRef} type="file" multiple disabled={loading} className="hidden" onChange={(event) => event.target.files && onSelectFiles(event.target.files)} />
        </div>
        <div
          onDrop={handleDrop}
          onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!loading) onDragActiveChange(true) }}
          onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (!loading) onDragActiveChange(true) }}
          onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragActiveChange(false) }}
          onClick={() => !loading && inputRef.current?.click()}
          className={`mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition ${dragActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-blue-200 bg-white text-gray-500 hover:border-blue-400 hover:bg-blue-50/60'} ${loading ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" />拖放文件到这里</span>
        </div>
        {files.length > 0 && (
          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto" aria-label="待上传文件">
            {files.map((file) => (
              <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                {file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5 shrink-0 text-blue-500" /> : <FileText className="h-5 w-5 shrink-0 text-slate-500" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{file.name}</div>
                  <div className="text-xs text-gray-400">{formatFileSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onRemoveFile(file) }}
                  disabled={loading}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label={`移除 ${file.name}`}
                  title="移除"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <WorkInstructionFormFields
        form={form}
        onChange={onFormChange}
        materials={materials}
        selectedMaterial={selectedMaterial}
        onMaterialSearch={onMaterialSearch}
        categoryOptions={categoryOptions}
        fieldDefinitions={fieldDefinitions}
      />
      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        {files.length > 0 ? `保存时将同时上传 ${files.length} 个文件。` : '未选择文件时，可单独创建在线文档。'}
      </div>
    </ModalDialog>
  )
}
