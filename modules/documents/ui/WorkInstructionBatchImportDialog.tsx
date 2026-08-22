'use client'

import type { RefObject } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import type { MaterialOption, WorkInstructionForm } from '../contracts/work-instruction'
import { formatFileSize } from '../model/work-instruction-view'
import WorkInstructionFormFields from './WorkInstructionFormFields'

export default function WorkInstructionBatchImportDialog({
  form,
  onFormChange,
  materials,
  selectedMaterial,
  onMaterialSearch,
  categoryOptions,
  fieldDefinitions,
  files,
  inputRef,
  loading,
  onSelectFiles,
  onRemoveFile,
  onClose,
  onSubmit,
}: {
  form: WorkInstructionForm
  onFormChange: (form: WorkInstructionForm) => void
  materials: MaterialOption[]
  selectedMaterial?: MaterialOption | null
  onMaterialSearch: (keyword: string) => void | Promise<void>
  categoryOptions: { value: string; label: string; keywords?: string }[]
  fieldDefinitions: DocumentFieldDefinitionRecord[]
  files: File[]
  inputRef: RefObject<HTMLInputElement>
  loading: boolean
  onSelectFiles: (files: FileList | File[]) => void
  onRemoveFile: (file: File) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <ModalDialog
      title="批量导入同类文档"
      description="一次选择多个同类图纸或文件，统一设置分类和共同字段。"
      size="wide"
      onClose={onClose}
      closeDisabled={loading}
      footer={<ModalActions onCancel={onClose} onConfirm={onSubmit} confirmLabel={`导入 ${files.length} 个文件`} disabled={files.length === 0 || !form.categoryId} busy={loading} />}
    >
      <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">待导入文件</h4>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"><Upload className="h-4 w-4" />选择多个文件</button>
          <input ref={inputRef} type="file" multiple disabled={loading} className="hidden" onChange={(event) => event.target.files && onSelectFiles(event.target.files)} />
        </div>
        <p className="mt-2 text-xs text-gray-600">每个文件将独立创建一篇文档，文件名作为初始文档标题；一次最多 50 个。</p>
        {files.length === 0 ? (
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 flex min-h-28 w-full items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-white text-sm text-gray-500 hover:border-blue-400 hover:bg-blue-50">点击选择需要导入的同类文件</button>
        ) : (
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto" aria-label="待批量导入文件">
            {files.map((file) => (
              <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-gray-800">{file.name}</div><div className="text-xs text-gray-400">{formatFileSize(file.size)}</div></div>
                <button type="button" onClick={() => onRemoveFile(file)} disabled={loading} aria-label={`移除 ${file.name}`} className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
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
        mode="batch"
      />
    </ModalDialog>
  )
}
