'use client'

import { useMemo, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { MAX_ATTACHMENT_FILE_SIZE } from '@/lib/attachment-file-types'
import {
  batchImportWorkInstructions,
  bulkUpdateWorkInstructions,
  listDocumentFieldDefinitions,
} from '../client/documents-api'
import type { DocumentCategoryRecord, MaterialOption, WorkInstruction, WorkInstructionForm } from '../contracts/work-instruction'
import type { WorkInstructionBulkUpdateInput } from '../contracts/work-instruction-schema'
import { createEmptyWorkInstructionForm, isSupportedDocumentFile, mergeSelectedFiles } from '../model/work-instruction-view'
import DocumentFieldManagerDialog from './DocumentFieldManagerDialog'
import WorkInstructionBatchImportDialog from './WorkInstructionBatchImportDialog'
import WorkInstructionBulkEditDialog from './WorkInstructionBulkEditDialog'

export default function useWorkInstructionMetadataActions({
  categories,
  categoryOptions,
  materials,
  selectedItems,
  selectedIds,
  canBatchImport,
  canBulkUpdate,
  canCreateFields,
  canUpdateFields,
  canDeleteFields,
  onMaterialSearch,
  onChanged,
  onFieldDefinitionsChanged,
  onClearSelection,
  onMessage,
}: {
  categories: DocumentCategoryRecord[]
  categoryOptions: { value: string; label: string; keywords?: string }[]
  materials: MaterialOption[]
  selectedItems: WorkInstruction[]
  selectedIds: string[]
  canBatchImport: boolean
  canBulkUpdate: boolean
  canCreateFields: boolean
  canUpdateFields: boolean
  canDeleteFields: boolean
  onMaterialSearch: (keyword?: string) => void | Promise<void>
  onChanged: () => Promise<void>
  onFieldDefinitionsChanged: (categoryId: string) => void | Promise<void>
  onClearSelection: () => void
  onMessage: (message: string) => void
}) {
  const [fieldManagerOpen, setFieldManagerOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchForm, setBatchForm] = useState<WorkInstructionForm>(createEmptyWorkInstructionForm())
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchFieldDefinitions, setBatchFieldDefinitions] = useState<Awaited<ReturnType<typeof listDocumentFieldDefinitions>>>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkFieldDefinitions, setBulkFieldDefinitions] = useState<Awaited<ReturnType<typeof listDocumentFieldDefinitions>>>([])
  const batchUploadInputRef = useRef<HTMLInputElement>(null)
  const selectedBatchMaterial = useMemo(() => materials.find((material) => material.id === batchForm.materialId), [batchForm.materialId, materials])

  const loadDefinitions = async (categoryId: string) => {
    if (!categoryId) return []
    try {
      return await listDocumentFieldDefinitions(categoryId)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取扩展字段失败')
      return []
    }
  }

  const openBatchImport = async () => {
    const categoryId = categoryOptions[0]?.value || ''
    setBatchForm({ ...createEmptyWorkInstructionForm(), categoryId })
    setBatchFieldDefinitions(await loadDefinitions(categoryId))
    setBatchFiles([])
    setBatchOpen(true)
  }

  const changeBatchForm = async (next: WorkInstructionForm) => {
    if (next.categoryId !== batchForm.categoryId) {
      const definitions = await loadDefinitions(next.categoryId)
      setBatchFieldDefinitions(definitions)
      const validIds = new Set(definitions.map((definition) => definition.id))
      next = { ...next, fieldValues: Object.fromEntries(Object.entries(next.fieldValues).filter(([id]) => validIds.has(id))) }
    }
    setBatchForm(next)
  }

  const selectBatchFiles = (files: FileList | File[]) => {
    const selected = Array.from(files)
    const ready = selected.filter(isSupportedDocumentFile)
    const allMerged = mergeSelectedFiles(batchFiles, ready)
    setBatchFiles(allMerged.slice(0, 50))
    if (selected.some((file) => file.size <= 0 || file.size > MAX_ATTACHMENT_FILE_SIZE)) onMessage('已忽略空文件或超过 50 MB 的文件')
    if (allMerged.length > 50) onMessage('一次最多导入 50 个文件')
    if (batchUploadInputRef.current) batchUploadInputRef.current.value = ''
  }

  const submitBatchImport = async () => {
    if (!batchForm.categoryId || batchFiles.length === 0) return
    setBatchLoading(true)
    try {
      const result = await batchImportWorkInstructions({
        categoryId: batchForm.categoryId,
        materialId: batchForm.materialId || null,
        version: batchForm.version.trim() || 'v1',
        status: batchForm.status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED',
        note: batchForm.note.trim() || undefined,
        fieldValues: batchForm.fieldValues,
      }, batchFiles)
      setBatchOpen(false)
      setBatchFiles([])
      await onChanged()
      onMessage(result.failed.length === 0
        ? `已批量导入 ${result.imported.length} 篇文档`
        : `已导入 ${result.imported.length} 篇，失败 ${result.failed.length} 个：${result.failed.map((item) => item.fileName).join('、')}`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '批量导入文档失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const openBulkEdit = async () => {
    if (selectedItems.length === 0) return
    const categoryIds = Array.from(new Set(selectedItems.map((instruction) => instruction.categoryId)))
    setBulkFieldDefinitions(categoryIds.length === 1 ? await loadDefinitions(categoryIds[0]) : [])
    setBulkOpen(true)
  }

  const submitBulkEdit = async (updates: WorkInstructionBulkUpdateInput['updates']) => {
    setBulkLoading(true)
    try {
      const result = await bulkUpdateWorkInstructions({ ids: selectedIds, updates })
      onMessage(result.message)
      setBulkOpen(false)
      onClearSelection()
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '批量修改文档失败')
    } finally {
      setBulkLoading(false)
    }
  }

  const actionButtons = (
    <>
      {canBatchImport && <AppButton variant="primary" onClick={() => void openBatchImport()}>批量导入</AppButton>}
      {(canCreateFields || canUpdateFields || canDeleteFields) && <AppButton variant="secondary" onClick={() => setFieldManagerOpen(true)}>字段设置</AppButton>}
      {canBulkUpdate && <AppButton variant="secondary" onClick={() => void openBulkEdit()} disabled={selectedIds.length === 0}>批量修改{selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}</AppButton>}
    </>
  )

  const dialogs = (
    <>
      {fieldManagerOpen && <DocumentFieldManagerDialog categories={categories} initialCategoryId={categoryOptions[0]?.value} canCreate={canCreateFields} canUpdate={canUpdateFields} canDelete={canDeleteFields} onChanged={onFieldDefinitionsChanged} onClose={() => setFieldManagerOpen(false)} onMessage={onMessage} />}
      {batchOpen && <WorkInstructionBatchImportDialog form={batchForm} onFormChange={(next) => void changeBatchForm(next)} materials={materials} selectedMaterial={selectedBatchMaterial} onMaterialSearch={onMaterialSearch} categoryOptions={categoryOptions} fieldDefinitions={batchFieldDefinitions} files={batchFiles} inputRef={batchUploadInputRef} loading={batchLoading} onSelectFiles={selectBatchFiles} onRemoveFile={(file) => setBatchFiles((current) => current.filter((item) => item !== file))} onClose={() => !batchLoading && setBatchOpen(false)} onSubmit={submitBatchImport} />}
      {bulkOpen && <WorkInstructionBulkEditDialog selectedItems={selectedItems} materials={materials} fieldDefinitions={bulkFieldDefinitions} loading={bulkLoading} onClose={() => !bulkLoading && setBulkOpen(false)} onSubmit={submitBulkEdit} />}
    </>
  )

  return { actionButtons, dialogs }
}
