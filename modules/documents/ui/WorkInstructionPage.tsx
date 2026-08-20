'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBarPortal from '@/app/components/TopBarPortal'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import { EMPTY_DOCUMENT_JSON } from '@/lib/document-content'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import { MAX_ATTACHMENT_FILE_SIZE } from '@/lib/attachment-file-types'
import { refreshAttachmentPreviewUrls } from '@/modules/attachments'
import type {
  AttachmentItem, CustomerOption, DocumentCategoryRecord, MaterialOption, PaginationState,
  WorkCenterOption, WorkInstruction, WorkInstructionForm,
} from '../contracts/work-instruction'
import {
  archiveInstructionAttachment, archiveWorkInstructionRecord, listDocumentCategories,
  listDocumentCustomers, listDocumentWorkCenters, listFinishedMaterialOptions,
  listInstructionAttachments, listWorkInstructions, saveWorkInstruction,
  setInstructionAttachmentRotation, uploadInstructionAttachment,
} from '../client/documents-api'
import {
  createEmptyWorkInstructionForm,
  fileTypeOptions,
  getInstructionCategoryLabel,
  getInstructionCustomerName,
  instructionStatusOptions,
  isSupportedDocumentFile,
  mergeSelectedFiles,
  statusLabels,
} from '../model/work-instruction-view'
import { documentCategoryOptions } from '../domain/document-category-rules'
import WorkInstructionCollectionView from './WorkInstructionCollectionView'
import WorkInstructionCreateDialog from './WorkInstructionCreateDialog'
import WorkInstructionDetailDialog from './WorkInstructionDetailDialog'
import WorkInstructionFullscreenViewer, { type WorkInstructionViewerState } from './WorkInstructionFullscreenViewer'

export default function WorkInstructionPage({
  onMessage,
  canRegeneratePreviews,
}: {
  onMessage: (msg: string) => void
  canRegeneratePreviews: boolean
}) {
  const [items, setItems] = useState<WorkInstruction[]>([])
  const [categories, setCategories] = useState<DocumentCategoryRecord[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [advancedConditions, setAdvancedConditions] = useState<ResourceSearchCondition[]>([])
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.workInstructions.viewMode', 'card')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<WorkInstruction | null>(null)
  const [detailEditing, setDetailEditing] = useState(false)
  const [form, setForm] = useState<WorkInstructionForm>(createEmptyWorkInstructionForm())
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WorkInstruction | null>(null)
  const [detailAttachments, setDetailAttachments] = useState<AttachmentItem[]>([])
  const [selectedDetailAttachmentId, setSelectedDetailAttachmentId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [createDragActive, setCreateDragActive] = useState(false)
  const [viewer, setViewer] = useState<WorkInstructionViewerState | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [focusUploadOnOpen, setFocusUploadOnOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const createUploadInputRef = useRef<HTMLInputElement>(null)
  const detailUploadRef = useRef<HTMLDivElement>(null)
  const availableCategoryOptions = useMemo(() => documentCategoryOptions(categories), [categories])
  const advancedSearchFields = useMemo<readonly ResourceAdvancedSearchField<WorkInstruction>[]>(() => [
    { key: 'title', label: '文档标题', type: 'text', read: (instruction) => instruction.title },
    { key: 'categoryId', label: '文档类别', type: 'select', read: (instruction) => instruction.categoryId, options: availableCategoryOptions },
    { key: 'status', label: '状态', type: 'select', read: (instruction) => instruction.status, options: instructionStatusOptions },
    { key: 'version', label: '版本', type: 'text', read: (instruction) => instruction.version },
    { key: 'materialCode', label: '产品编码', type: 'text', read: (instruction) => instruction.material?.code },
    { key: 'materialName', label: '产品名称', type: 'text', read: (instruction) => instruction.material?.name },
    { key: 'materialSpec', label: '产品规格', type: 'text', read: (instruction) => instruction.material?.spec },
    { key: 'customerCode', label: '客户编码', type: 'text', read: (instruction) => instruction.material?.customer?.code },
    { key: 'customerName', label: '客户名称', type: 'text', read: (instruction) => instruction.material?.customer?.name },
    { key: 'workCenter', label: '工作中心', type: 'text', read: (instruction) => instruction.workCenters.map((item) => `${item.code} ${item.name}`).join(' ') },
    { key: 'contentText', label: '在线正文', type: 'text', read: (instruction) => instruction.contentText },
    { key: 'note', label: '备注', type: 'text', read: (instruction) => instruction.note },
    { key: 'attachmentName', label: '附件名称', type: 'text', read: (instruction) => instruction.primaryAttachment?.originalName },
    { key: 'fileType', label: '文件类型', type: 'select', read: () => '', options: fileTypeOptions.filter((option) => option.value !== 'all') },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (instruction) => instruction.createdAt },
    { key: 'updatedAt', label: '更新日期', type: 'date', read: (instruction) => instruction.updatedAt },
  ], [availableCategoryOptions])
  const instructionSort = useClientTableSort(items, {
    code: (instruction) => instruction.material?.code || '',
    name: (instruction) => instruction.title,
    category: (instruction) => getInstructionCategoryLabel(instruction),
    status: (instruction) => statusLabels[instruction.status] || instruction.status,
    customer: (instruction) => getInstructionCustomerName(instruction),
    files: (instruction) => instruction.attachmentCount,
    workCenters: (instruction) => instruction.workCenters.map((item) => `${item.code} ${item.name}`).join(' '),
  }, 'code', 'asc')
  const selectedDetailAttachmentIndex = Math.max(0, detailAttachments.findIndex((attachment) => attachment.id === selectedDetailAttachmentId))
  const selectedDetailAttachment = detailAttachments[selectedDetailAttachmentIndex] || null

  useEffect(() => {
    fetchInstructions()
  }, [keyword, advancedConditions, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [keyword, advancedConditions, pageSize])

  useEffect(() => {
    fetchCategories()
    fetchCustomers()
    fetchMaterials()
    fetchWorkCenters()
  }, [])

  useEffect(() => {
    if (detail) fetchAttachments(detail.id)
  }, [detail?.id])

  useEffect(() => {
    if (!detail || !focusUploadOnOpen) return
    const timer = setTimeout(() => {
      detailUploadRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFocusUploadOnOpen(false)
    }, 80)
    return () => clearTimeout(timer)
  }, [detail, focusUploadOnOpen])

  const mergeMaterialOptions = useCallback((nextMaterials: MaterialOption[]) => {
    setMaterials((current) => {
      const merged = new Map<string, MaterialOption>()
      nextMaterials.forEach((material) => merged.set(material.id, material))
      current.forEach((material) => {
        if (!merged.has(material.id)) merged.set(material.id, material)
      })
      return Array.from(merged.values()).slice(0, 300)
    })
  }, [])

  const ensureMaterialOption = useCallback((material?: MaterialOption | null) => {
    if (!material) return
    mergeMaterialOptions([material])
  }, [mergeMaterialOptions])

  const fetchCategories = async () => {
    try {
      setCategories(await listDocumentCategories())
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '获取文档类别失败')
    }
  }

  const buildParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (advancedConditions.length > 0) params.set('advanced', JSON.stringify(advancedConditions.map(({ field, operator, value }) => ({ field, operator, value }))))
    return params
  }

  const fetchInstructions = async () => {
    try {
      const result = await listWorkInstructions(buildParams())
      const nextItems = result.items
      const nextPagination = result.pagination || { page, pageSize, total: nextItems.length, totalPages: 1 }
      setItems(nextItems)
      setPagination(nextPagination)
      if (nextPagination.total > 0 && nextPagination.page > nextPagination.totalPages) {
        setPage(nextPagination.totalPages)
      }
      setDetail((current) => current ? nextItems.find((item: WorkInstruction) => item.id === current.id) || current : null)
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '获取产品文档失败')
      setItems([])
    }
  }

  const fetchCustomers = async () => {
    try {
      setCustomers(await listDocumentCustomers())
    } catch (err) {
      // ignore
    }
  }

  const fetchMaterials = useCallback(async (searchKeyword = '') => {
    try {
      mergeMaterialOptions(await listFinishedMaterialOptions(searchKeyword))
    } catch (err) {
      // ignore
    }
  }, [mergeMaterialOptions])

  const fetchAttachments = async (instructionId: string) => {
    try {
      const attachments = await listInstructionAttachments(instructionId)
      setDetailAttachments(attachments)
      setSelectedDetailAttachmentId((current) => (
        current && attachments.some((attachment) => attachment.id === current)
          ? current
          : attachments[0]?.id || null
      ))
      return attachments
    } catch (err) {
      setDetailAttachments([])
    }
    return [] as AttachmentItem[]
  }

  const fetchWorkCenters = async () => {
    try {
      setWorkCenters(await listDocumentWorkCenters())
    } catch (err) {
      // 通用文档允许不限制工作中心，读取失败不阻塞其余内容。
    }
  }

  const openAddModal = () => {
    setEditing(null)
    setDetailEditing(false)
    setForm({
      ...createEmptyWorkInstructionForm(),
      categoryId: availableCategoryOptions[0]?.value || '',
    })
    setCreateFiles([])
    setCreateDragActive(false)
    setShowModal(true)
  }

  const closeAddModal = () => {
    if (loading) return
    setShowModal(false)
    setCreateFiles([])
    setCreateDragActive(false)
    if (createUploadInputRef.current) createUploadInputRef.current.value = ''
  }

  const selectCreateFiles = (files: FileList | File[]) => {
    const selectedFiles = Array.from(files)
    const acceptedFiles = selectedFiles.filter(isSupportedDocumentFile)
    const oversizedFiles = selectedFiles.filter((file) => file.size > MAX_ATTACHMENT_FILE_SIZE)
    const readyFiles = acceptedFiles

    if (readyFiles.length > 0) {
      setCreateFiles((current) => mergeSelectedFiles(current, readyFiles))
    }
    if (oversizedFiles.length > 0) {
      onMessage('单个文件不能超过 50 MB')
    }
    if (createUploadInputRef.current) createUploadInputRef.current.value = ''
  }

  const openDetail = (instruction: WorkInstruction, focusUpload = false) => {
    ensureMaterialOption(instruction.material)
    setFocusUploadOnOpen(focusUpload)
    setDetailEditing(false)
    setDetail(instruction)
    setSelectedDetailAttachmentId(instruction.primaryAttachment?.id || null)
  }

  const startDetailEdit = (instruction: WorkInstruction) => {
    ensureMaterialOption(instruction.material)
    setEditing(instruction)
    setForm({
      title: instruction.title,
      categoryId: instruction.categoryId,
      version: instruction.version || 'v1',
      status: instruction.status || 'ACTIVE',
      materialId: instruction.materialId || '',
      workCenterIds: instruction.workCenters.map((item) => item.id),
      contentJson: instruction.contentJson || EMPTY_DOCUMENT_JSON,
      note: instruction.note || '',
    })
    setDetailEditing(true)
  }

  const cancelDetailEdit = () => {
    setDetailEditing(false)
    setEditing(null)
  }

  const closeDetail = () => {
    setDetail(null)
    setSelectedDetailAttachmentId(null)
    setDetailEditing(false)
    setEditing(null)
  }

  const uploadInstructionFiles = async (instructionId: string, files: File[]) => {
    const uploaded: AttachmentItem[] = []
    const failedFiles: string[] = []

    for (const file of files) {
      try {
        uploaded.push(await uploadInstructionAttachment(instructionId, file))
      } catch (error) {
        failedFiles.push(file.name)
      }
    }

    return { uploaded, failedFiles }
  }

  const submitForm = async () => {
    if (!form.categoryId) {
      onMessage('请选择文档类别')
      return
    }

    setLoading(true)
    try {
      const payload = {
        title: form.title.trim(),
        materialId: form.materialId || null,
        categoryId: form.categoryId,
        version: form.version.trim() || 'v1',
        status: form.status,
        workCenterIds: form.workCenterIds,
        contentJson: form.contentJson,
        note: form.note.trim() || undefined,
      }
      const savedInstruction = await saveWorkInstruction(payload, editing?.id)
        const wasEditing = Boolean(editing)
        const filesToUpload = wasEditing ? [] : createFiles
        const uploadResult = !wasEditing && savedInstruction && filesToUpload.length > 0
          ? await uploadInstructionFiles(savedInstruction.id, filesToUpload)
          : { uploaded: [] as AttachmentItem[], failedFiles: [] as string[] }

        setShowModal(false)
        setCreateFiles([])
        setCreateDragActive(false)
        setEditing(null)
        setDetailEditing(false)
        if (wasEditing && savedInstruction && detail?.id === savedInstruction.id) {
          setDetail({ ...detail, ...savedInstruction })
        }
        if (!wasEditing && savedInstruction) {
          const imageCount = uploadResult.uploaded.filter((attachment) => attachment.mimeType.startsWith('image/')).length
          const pdfCount = uploadResult.uploaded.filter((attachment) => attachment.mimeType === 'application/pdf').length
          const createdInstruction: WorkInstruction = {
            ...savedInstruction,
            attachmentCount: uploadResult.uploaded.length,
            imageCount,
            pdfCount,
            primaryAttachment: uploadResult.uploaded.find((attachment) => attachment.mimeType.startsWith('image/')) || uploadResult.uploaded[0] || null,
          }
          ensureMaterialOption(createdInstruction.material)
          setDetail(createdInstruction)
          setDetailAttachments(uploadResult.uploaded)
          setSelectedDetailAttachmentId(uploadResult.uploaded[0]?.id || null)
          setFocusUploadOnOpen(uploadResult.failedFiles.length > 0)
        }
        if (wasEditing) {
          onMessage('文档已更新')
        } else if (filesToUpload.length === 0) {
          onMessage('文档已创建')
        } else if (uploadResult.failedFiles.length === 0) {
          onMessage(`文档已创建并上传 ${uploadResult.uploaded.length} 个文件`)
        } else {
          onMessage(`文档已创建，已上传 ${uploadResult.uploaded.length} 个；失败：${uploadResult.failedFiles.join('、')}`)
        }
        await fetchInstructions()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '保存失败')
    }
    setLoading(false)
  }

  const archiveInstruction = async (instruction: WorkInstruction) => {
    if (!confirm(`确定归档文档「${instruction.title}」吗？`)) return
    try {
      onMessage(await archiveWorkInstructionRecord(instruction.id))
      if (detail?.id === instruction.id) closeDetail()
      await fetchInstructions()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '归档失败')
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    if (!detail) return
    const selectedFiles = Array.from(files)
    const acceptedFiles = selectedFiles.filter(isSupportedDocumentFile)
    if (acceptedFiles.length === 0) {
      onMessage('请选择 50 MB 以内的文件')
      return
    }

    setUploading(true)
    try {
      const uploadResult = await uploadInstructionFiles(detail.id, acceptedFiles)
      if (uploadResult.uploaded.length > 0) {
        await fetchAttachments(detail.id)
        setSelectedDetailAttachmentId(uploadResult.uploaded[0].id)
        await fetchInstructions()
      }
      if (uploadResult.failedFiles.length === 0) {
        onMessage(`已上传 ${uploadResult.uploaded.length} 个文件`)
      } else {
        onMessage(`已上传 ${uploadResult.uploaded.length} 个；失败：${uploadResult.failedFiles.join('、')}`)
      }
    } catch (err) {
      onMessage('文件上传失败')
    }
    setUploading(false)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  const archiveAttachment = async (attachment: AttachmentItem) => {
    if (!confirm(`确定归档文件 ${attachment.originalName} 吗？`)) return
    try {
      await archiveInstructionAttachment(attachment.id)
      onMessage('文件已归档')
      if (detail) await fetchAttachments(detail.id)
      await fetchInstructions()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '归档文件失败')
    }
  }

  const handlePreviewRegenerated = (attachmentId: string, revision: number) => {
    const refresh = (attachment: AttachmentItem) => attachment.id === attachmentId
      ? refreshAttachmentPreviewUrls(attachment, revision)
      : attachment
    setDetailAttachments((current) => current.map(refresh))
    setViewer((current) => current ? { ...current, attachments: current.attachments.map(refresh) } : current)
  }

  const openViewer = (instruction: WorkInstruction, attachments: AttachmentItem[], index = 0) => {
    if (attachments.length === 0) {
      onMessage('暂无可预览文件')
      return
    }
    setViewer({ instruction, attachments, index })
    setViewerZoom(1)
  }

  const openFullscreenPreview = async (instruction: WorkInstruction) => {
    try {
      const attachments = await listInstructionAttachments(instruction.id)
      if (!instruction.contentText && attachments.length === 0) {
        onMessage('暂无可预览内容')
        return
      }
      setViewer({ instruction, attachments, index: instruction.contentText ? -1 : 0 })
      setViewerZoom(1)
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '获取预览内容失败')
    }
  }

  const selectedViewerAttachment = viewer?.attachments[viewer.index]
  const saveSelectedAttachmentRotation = async (delta: number) => {
    if (!selectedViewerAttachment || rotationSaving) return
    const nextRotation = normalizeAttachmentRotation(Number(selectedViewerAttachment.rotation || 0) + delta)
    setRotationSaving(true)
    try {
      const result = await setInstructionAttachmentRotation(selectedViewerAttachment.id, nextRotation)
      const updated = result.attachment
      setViewer((current) => current ? {
        ...current,
        attachments: current.attachments.map((attachment) => attachment.id === updated.id ? updated : attachment),
      } : current)
      setDetailAttachments((current) => current.map((attachment) => attachment.id === updated.id ? updated : attachment))
      setItems((current) => current.map((instruction) => (
        instruction.primaryAttachment?.id === updated.id
          ? { ...instruction, primaryAttachment: updated }
          : instruction
      )))
      setDetail((current) => (
        current?.primaryAttachment?.id === updated.id
          ? { ...current, primaryAttachment: updated }
          : current
      ))
      onMessage(result.message)
    } catch (err) {
      onMessage('保存文件方向失败')
    } finally {
      setRotationSaving(false)
    }
  }
  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === form.materialId),
    [materials, form.materialId]
  )
  const activeFilterLabels = useMemo(() => advancedConditions.map((condition) => {
    const field = advancedSearchFields.find((candidate) => candidate.key === condition.field)
    const option = field?.options?.find((candidate) => candidate.value === condition.value)
    return `${field?.label || condition.field}：${option?.label || condition.value}`
  }), [advancedConditions, advancedSearchFields])

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={(
        <SearchFieldWithPresets
          storageKey="mes-lite.searchPresets.documents"
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索标题、正文、产品或备注"
          conditions={advancedConditions}
          onConditionsChange={setAdvancedConditions}
          conditionLabel={`${advancedConditions.length} 个文档字段`}
        />
      )}
      advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={advancedConditions} onChange={setAdvancedConditions} />}
      filterCount={activeFilterLabels.length}
      filterSummary={activeFilterLabels.slice(0, 3).map((label) => (
        <span key={label} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{label}</span>
      ))}
      viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
      actions={(
        <AppButton
          variant="create"
          onClick={openAddModal}
        >
          新建文档
        </AppButton>
      )}
    />
  )

  return (
    <>
      <TopBarPortal>{toolbar}</TopBarPortal>

      <div className="rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-6 sm:shadow">
        <WorkInstructionCollectionView
          items={instructionSort.sortedRows}
          viewMode={viewMode}
          sortColumn={instructionSort.sortColumn}
          sortDirection={instructionSort.sortDirection}
          onSort={instructionSort.toggleSort}
          pagination={pagination}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onCreate={openAddModal}
          onOpenPreview={(instruction) => void openFullscreenPreview(instruction)}
          onOpenDetail={openDetail}
          onArchive={archiveInstruction}
        />
      </div>

      {showModal && (
        <WorkInstructionCreateDialog
          form={form}
          onFormChange={setForm}
          materials={materials}
          selectedMaterial={selectedMaterial}
          onMaterialSearch={fetchMaterials}
          categoryOptions={availableCategoryOptions}
          workCenters={workCenters}
          files={createFiles}
          loading={loading}
          dragActive={createDragActive}
          onDragActiveChange={setCreateDragActive}
          onSelectFiles={selectCreateFiles}
          onRemoveFile={(file) => setCreateFiles((current) => current.filter((item) => item !== file))}
          inputRef={createUploadInputRef}
          onClose={closeAddModal}
          onSubmit={submitForm}
        />
      )}

      {detail && (
        <WorkInstructionDetailDialog
          detail={detail}
          editing={detailEditing}
          form={form}
          onFormChange={setForm}
          materials={materials}
          selectedMaterial={selectedMaterial}
          onMaterialSearch={fetchMaterials}
          categoryOptions={availableCategoryOptions}
          workCenters={workCenters}
          attachments={detailAttachments}
          selectedAttachment={selectedDetailAttachment}
          selectedAttachmentIndex={selectedDetailAttachmentIndex}
          onSelectAttachment={setSelectedDetailAttachmentId}
          loading={loading}
          uploading={uploading}
          dragActive={dragActive}
          focusUploadOnOpen={focusUploadOnOpen}
          uploadInputRef={uploadInputRef}
          uploadAreaRef={detailUploadRef}
          onDragActiveChange={setDragActive}
          onFiles={handleFiles}
          onClose={closeDetail}
          onStartEdit={() => startDetailEdit(detail)}
          onCancelEdit={cancelDetailEdit}
          onSave={submitForm}
          onOpenViewer={(index) => openViewer(detail, detailAttachments, index)}
          onArchiveAttachment={archiveAttachment}
          onPreviewRegenerated={handlePreviewRegenerated}
          onMessage={onMessage}
          canRegeneratePreviews={canRegeneratePreviews}
        />
      )}

      {viewer && (viewer.index === -1 || selectedViewerAttachment) && (
        <WorkInstructionFullscreenViewer
          viewer={viewer}
          attachment={selectedViewerAttachment || null}
          zoom={viewerZoom}
          rotationSaving={rotationSaving}
          onNavigate={(index) => setViewer({ ...viewer, index })}
          onZoomChange={setViewerZoom}
          onRotate={(delta) => void saveSelectedAttachmentRotation(delta)}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  )
}
