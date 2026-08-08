'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import DocumentPreviewThumb from './DocumentPreviewThumb'
import DocumentFileViewer from './DocumentFileViewer'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'
import {
  DocumentCategoryItem,
  documentCategoryLabel,
  documentCategoryOptions,
} from './DocumentCategoryManagerModal'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import { appInputClassName, appSelectClassName, appTextareaClassName } from './FormField'
import AppButton from './AppButton'
import OnlineDocumentEditor from './OnlineDocumentEditor'
import { EMPTY_DOCUMENT_JSON } from '@/lib/document-content'
import OneToManyRelationField from './relations/OneToManyRelationField'
import { ResourceAdvancedSearch } from './resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import {
  MAX_ATTACHMENT_FILE_SIZE,
  attachmentPreviewKind,
  attachmentTypeLabel,
  type AttachmentPreviewKind,
} from '@/lib/attachment-file-types'

interface Customer {
  id: string
  code: string
  name: string
}

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category?: string
  customerId?: string | null
  customer?: Customer | null
}

interface WorkCenterOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface AttachmentItem {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string | null
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  note?: string | null
  documentType: string
  isCover: boolean
  rotation: number
  createdAt: string
}

interface WorkInstruction {
  id: string
  categoryId: string
  category: Pick<DocumentCategoryItem, 'id' | 'name' | 'parentId' | 'parent'>
  title: string
  version: string
  status: string
  materialId?: string | null
  material?: MaterialOption | null
  workCenters: WorkCenterOption[]
  contentJson?: string | null
  contentText?: string | null
  note?: string | null
  attachmentCount: number
  imageCount: number
  pdfCount: number
  primaryAttachment?: AttachmentItem | null
  createdAt: string
  updatedAt: string
}

interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type WorkInstructionForm = {
  title: string
  categoryId: string
  version: string
  status: string
  materialId: string
  workCenterIds: string[]
  contentJson: string
  note: string
}

const instructionStatusOptions = [
  { value: 'ACTIVE', label: '启用' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ARCHIVED', label: '停用' },
]

const fileTypeOptions = [
  { value: 'all', label: '全部文件' },
  { value: 'image', label: '图片' },
  { value: 'pdf', label: 'PDF' },
  { value: 'office', label: 'Office' },
] as const

const statusLabels = Object.fromEntries(instructionStatusOptions.map((item) => [item.value, item.label]))

function createEmptyForm(): WorkInstructionForm {
  return {
    title: '',
    categoryId: '',
    version: 'v1',
    status: 'ACTIVE',
    materialId: '',
    workCenterIds: [],
    contentJson: EMPTY_DOCUMENT_JSON,
    note: '',
  }
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function isSupportedDocumentFile(file: File) {
  return file.size > 0 && file.size <= MAX_ATTACHMENT_FILE_SIZE
}

function mergeSelectedFiles(current: File[], next: File[]) {
  const merged = new Map(current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]))
  next.forEach((file) => merged.set(`${file.name}:${file.size}:${file.lastModified}`, file))
  return Array.from(merged.values())
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

function Pagination({
  pagination,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationState
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const totalPages = Math.max(1, pagination.totalPages || 1)
  const currentPage = Math.min(Math.max(1, pagination.page || 1), totalPages)
  const start = pagination.total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(pagination.total, currentPage * pageSize)

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="whitespace-nowrap">共 {pagination.total} 条，当前 {start}-{end} 条，第 {currentPage}/{totalPages} 页</div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
        </select>
        {[
          ['首页', 1, currentPage <= 1],
          ['上一页', currentPage - 1, currentPage <= 1],
          ['下一页', currentPage + 1, currentPage >= totalPages],
          ['末页', totalPages, currentPage >= totalPages],
        ].map(([label, nextPage, disabled]) => (
          <button
            key={String(label)}
            type="button"
            onClick={() => onPageChange(Number(nextPage))}
            disabled={Boolean(disabled)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function InstructionBadge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone]

  return <span className={`rounded px-2 py-1 text-xs font-medium ${toneClass}`}>{children}</span>
}

function formatMaterialLabel(material: MaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function materialIncludesKeyword(material: MaterialOption, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return true
  return [material.code, material.name, material.spec || '', material.customer?.name || '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedKeyword)
}

function getInstructionCustomerName(instruction: WorkInstruction) {
  return instruction.material?.customer?.name || '通用/未绑定'
}

function getInstructionScopeLabel(instruction: WorkInstruction) {
  return instruction.material ? `${instruction.material.code} · ${instruction.material.name}` : '通用文档'
}

function MaterialSearchSelect({
  value,
  options,
  selectedOption,
  onChange,
  onSearch,
  placeholder = '输入产品编码或名称搜索',
  emptyLabel = '请选择产品',
  unassignedLabel,
}: {
  value: string
  options: MaterialOption[]
  selectedOption?: MaterialOption | null
  onChange: (value: string, material?: MaterialOption | null) => void
  onSearch: (keyword: string) => void | Promise<void>
  placeholder?: string
  emptyLabel?: string
  unassignedLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = selectedOption || options.find((material) => material.id === value) || null
  const specialLabel = value === '__UNASSIGNED__' && unassignedLabel ? unassignedLabel : ''
  const visibleOptions = useMemo(() => {
    return options.filter((material) => materialIncludesKeyword(material, query)).slice(0, 50)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      void onSearch(query.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [open, query, onSearch])

  const selectMaterial = (material: MaterialOption | null, nextValue?: string) => {
    onChange(nextValue ?? material?.id ?? '', material)
    closePopup()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={open ? query : selected ? formatMaterialLabel(selected) : specialLabel}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closePopup()
          }
        }}
        placeholder={selected ? formatMaterialLabel(selected) : specialLabel || placeholder}
        className="w-full rounded-lg border border-gray-200 px-4 py-2 pr-12 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => selectMaterial(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          清除
        </button>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => selectMaterial(null)}
            className="block w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
          >
            {emptyLabel}
          </button>
          {unassignedLabel && (
            <button
              type="button"
              onClick={() => selectMaterial(null, '__UNASSIGNED__')}
              className="block w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              {unassignedLabel}
            </button>
          )}
          {visibleOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">没有匹配产品</div>
          ) : (
            visibleOptions.map((material) => (
              <button
                key={material.id}
                type="button"
                onClick={() => selectMaterial(material)}
                className="block w-full px-3 py-2 text-left hover:bg-blue-50"
              >
                <div className="truncate text-sm font-medium text-gray-900">{material.code} · {material.name}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">
                  {[material.spec, material.customer?.name].filter(Boolean).join(' · ') || '无规格/客户信息'}
                </div>
              </button>
            ))
          )}
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">输入编码、名称、规格或客户继续搜索</div>
        </div>
      )}
    </div>
  )
}

function WorkCenterPicker({
  options,
  value,
  onChange,
}: {
  options: WorkCenterOption[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const selected = options.filter((item) => value.includes(item.id))
  const available = options.filter((item) => !value.includes(item.id)).map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.name}`,
    keywords: item.name,
  }))

  return (
    <OneToManyRelationField
      title="已选工作中心"
      items={selected}
      getKey={(item) => item.id}
      selector={(
        <SearchableSelect
          value=""
          onChange={(id) => id && onChange([...value, id])}
          options={available}
          placeholder={available.length > 0 ? '输入工作中心筛选并添加' : '已选择全部工作中心'}
        />
      )}
      renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.name}</div><div className="font-mono text-xs text-gray-500">{item.code}</div></>}
      onRemove={(item) => onChange(value.filter((id) => id !== item.id))}
      emptyText="未指定时表示不限制工作中心"
    />
  )
}

export default function WorkInstructionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [items, setItems] = useState<WorkInstruction[]>([])
  const [categories, setCategories] = useState<DocumentCategoryItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
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
  const [form, setForm] = useState<WorkInstructionForm>(createEmptyForm())
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WorkInstruction | null>(null)
  const [detailAttachments, setDetailAttachments] = useState<AttachmentItem[]>([])
  const [selectedDetailAttachmentId, setSelectedDetailAttachmentId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [createDragActive, setCreateDragActive] = useState(false)
  const [viewer, setViewer] = useState<{ instruction: WorkInstruction; attachments: AttachmentItem[]; index: number } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [focusUploadOnOpen, setFocusUploadOnOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const createUploadInputRef = useRef<HTMLInputElement | null>(null)
  const detailUploadRef = useRef<HTMLDivElement | null>(null)
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
    category: (instruction) => documentCategoryLabel(instruction.category),
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
      const res = await fetch('/api/document-categories')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取文档类别失败')
        return
      }
      const nextCategories = (data.data || []) as DocumentCategoryItem[]
      setCategories(nextCategories)
    } catch (err) {
      onMessage('获取文档类别失败')
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
      const params = buildParams()
      const res = await fetch(`/api/work-instructions?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取产品文档失败')
        setItems([])
        return
      }
      const nextItems = data.data || []
      const nextPagination = data.pagination || { page, pageSize, total: nextItems.length, totalPages: 1 }
      setItems(nextItems)
      setPagination(nextPagination)
      if (nextPagination.total > 0 && nextPagination.page > nextPagination.totalPages) {
        setPage(nextPagination.totalPages)
      }
      setDetail((current) => current ? nextItems.find((item: WorkInstruction) => item.id === current.id) || current : null)
    } catch (err) {
      onMessage('获取产品文档失败')
      setItems([])
    }
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const fetchMaterials = useCallback(async (searchKeyword = '') => {
    try {
      const params = new URLSearchParams()
      params.set('pageSize', '50')
      params.set('category', 'FINISHED')
      const keyword = searchKeyword.trim()
      if (keyword) params.set('keyword', keyword)
      const res = await fetch(`/api/materials?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        mergeMaterialOptions(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }, [mergeMaterialOptions])

  const fetchAttachments = async (instructionId: string) => {
    try {
      const res = await fetch(`/api/attachments?ownerType=WORK_INSTRUCTION&ownerId=${encodeURIComponent(instructionId)}`)
      if (res.ok) {
        const data = await res.json()
        const attachments = (data.data || []) as AttachmentItem[]
        setDetailAttachments(attachments)
        setSelectedDetailAttachmentId((current) => (
          current && attachments.some((attachment) => attachment.id === current)
            ? current
            : attachments[0]?.id || null
        ))
        return attachments
      }
    } catch (err) {
      setDetailAttachments([])
    }
    return [] as AttachmentItem[]
  }

  const fetchWorkCenters = async () => {
    try {
      const res = await fetch('/api/work-centers')
      const data = await res.json()
      if (res.ok) setWorkCenters(data.data || [])
    } catch (err) {
      // 通用文档允许不限制工作中心，读取失败不阻塞其余内容。
    }
  }

  const openAddModal = () => {
    setEditing(null)
    setDetailEditing(false)
    setForm({
      ...createEmptyForm(),
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
        const formData = new FormData()
        formData.append('ownerType', 'WORK_INSTRUCTION')
        formData.append('ownerId', instructionId)
        formData.append('documentType', 'WORK_INSTRUCTION')
        formData.append('file', file)

        const res = await fetch('/api/attachments', { method: 'POST', body: formData })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.data) {
          failedFiles.push(file.name)
        } else {
          uploaded.push(data.data)
        }
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
      const res = await fetch('/api/work-instructions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      })
      const data = await res.json()
      if (res.ok) {
        const wasEditing = Boolean(editing)
        const savedInstruction = data.data
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
      } else {
        onMessage(data.error || '保存失败')
      }
    } catch (err) {
      onMessage('保存失败')
    }
    setLoading(false)
  }

  const archiveInstruction = async (instruction: WorkInstruction) => {
    if (!confirm(`确定归档文档「${instruction.title}」吗？`)) return
    try {
      const res = await fetch(`/api/work-instructions?id=${instruction.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '产品文档已归档')
        if (detail?.id === instruction.id) closeDetail()
        await fetchInstructions()
      } else {
        onMessage(data.error || '归档失败')
      }
    } catch (err) {
      onMessage('归档失败')
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
    const res = await fetch(`/api/attachments?id=${attachment.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('文件已归档')
      if (detail) await fetchAttachments(detail.id)
      await fetchInstructions()
    } else {
      onMessage(data.error || '归档文件失败')
    }
  }

  const openViewer = (instruction: WorkInstruction, attachments: AttachmentItem[], index = 0) => {
    if (attachments.length === 0) {
      onMessage('暂无可预览文件')
      return
    }
    setViewer({ instruction, attachments, index })
    setViewerZoom(1)
  }

  const selectedViewerAttachment = viewer?.attachments[viewer.index]
  const saveSelectedAttachmentRotation = async (delta: number) => {
    if (!selectedViewerAttachment || rotationSaving) return
    const nextRotation = normalizeAttachmentRotation(Number(selectedViewerAttachment.rotation || 0) + delta)
    setRotationSaving(true)
    try {
      const res = await fetch('/api/attachments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedViewerAttachment.id,
          action: 'SET_ROTATION',
          rotation: nextRotation,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存文件方向失败')
        return
      }
      const updated = data.data as AttachmentItem
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
      onMessage(data.message || '文件方向已保存')
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
        {items.length === 0 ? (
          <div className="rounded-lg bg-white py-10 text-center text-gray-500 shadow sm:bg-transparent sm:py-12 sm:shadow-none">
            <p>暂无文档</p>
            <AppButton
              variant="create"
              onClick={openAddModal}
              className="mt-4"
            >
              新建第一篇文档
            </AppButton>
          </div>
        ) : viewMode === 'card' ? (
          <>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {instructionSort.sortedRows.map((instruction) => (
                <article key={instruction.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:shadow-none">
                  <button
                    type="button"
                    onClick={() => openDetail(instruction)}
                    className="text-left"
                  >
                    <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} className="!aspect-auto h-[clamp(12rem,28vw,18rem)]" />
                  </button>
                  <div className="mt-3 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <InstructionBadge tone="blue">{instruction.material?.code || '通用'}</InstructionBadge>
                      <InstructionBadge>{documentCategoryLabel(instruction.category)}</InstructionBadge>
                      <InstructionBadge tone={instruction.status === 'ACTIVE' ? 'green' : instruction.status === 'DRAFT' ? 'amber' : 'gray'}>
                        {statusLabels[instruction.status] || instruction.status}
                      </InstructionBadge>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{instruction.title}</h3>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      <div className="truncate">版本：{instruction.version || '-'}</div>
                      <div className="truncate">产品：{instruction.material ? instruction.material.name : '未绑定'}</div>
                      {instruction.material?.spec && <div className="truncate">规格：{instruction.material.spec}</div>}
                      <div className="truncate">客户：{getInstructionCustomerName(instruction)}</div>
                      <div className="line-clamp-2">工作中心：{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div>
                      <div>内容：{instruction.contentText ? '在线正文' : '无正文'} · {instruction.attachmentCount} 个附件</div>
                      {instruction.note && <div className="line-clamp-2">备注：{instruction.note}</div>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(instruction)}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                    >
                      在线阅读
                    </button>
                    <button
                      type="button"
                      onClick={() => openDetail(instruction)}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      详情
                    </button>
                    <button
                      type="button"
                      onClick={() => archiveInstruction(instruction)}
                      className="rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                    >
                      归档
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <Pagination pagination={pagination} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[1080px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-24 px-4 py-3 text-left text-sm font-semibold text-gray-600">预览</th>
                    <SortableTableHeader column="code" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-44">关联产品</SortableTableHeader>
                    <SortableTableHeader column="name" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort}>文档标题</SortableTableHeader>
                    <SortableTableHeader column="category" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-28">文档类别</SortableTableHeader>
                    <SortableTableHeader column="status" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-24">状态</SortableTableHeader>
                    <SortableTableHeader column="customer" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-36">客户</SortableTableHeader>
                    <SortableTableHeader column="workCenters" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-40">工作中心</SortableTableHeader>
                    <SortableTableHeader column="files" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-28">文件</SortableTableHeader>
                    <th className="w-56 px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {instructionSort.sortedRows.map((instruction) => (
                    <tr key={instruction.id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openDetail(instruction)}
                          className="block h-14 w-20 overflow-hidden rounded"
                        >
                          <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-700">{getInstructionScopeLabel(instruction)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{instruction.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{instruction.version || '-'}</div>
                        {instruction.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">备注：{instruction.note}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{documentCategoryLabel(instruction.category)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{statusLabels[instruction.status] || instruction.status}</td>
                      <td className="px-4 py-3 text-sm">{getInstructionCustomerName(instruction)}</td>
                      <td className="px-4 py-3 text-sm"><div className="line-clamp-2">{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{instruction.contentText ? '在线 · ' : ''}{instruction.attachmentCount} 个附件</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openDetail(instruction)}
                            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            在线阅读
                          </button>
                          <button onClick={() => openDetail(instruction)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">详情</button>
                          <button onClick={() => archiveInstruction(instruction)} className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </div>

      {showModal && (
        <ModalDialog
          title="新建文档"
          description="上传原始文件或编辑在线正文。"
          onClose={closeAddModal}
          closeDisabled={loading}
          size="xl"
          footer={(
            <ModalActions
              onCancel={closeAddModal}
              onConfirm={submitForm}
              confirmLabel={createFiles.length > 0 ? '保存并上传' : '保存文档'}
              busy={loading}
            />
          )}
        >
              <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">原始文件（可选）</h4>
                    <p className="mt-1 text-xs text-gray-500">支持 Word、Excel、PowerPoint、PDF、图片及其他附件，单个文件不超过 50 MB。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => createUploadInputRef.current?.click()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    选择文件
                  </button>
                  <input
                    ref={createUploadInputRef}
                    type="file"
                    multiple
                    disabled={loading}
                    className="hidden"
                    onChange={(event) => event.target.files && selectCreateFiles(event.target.files)}
                  />
                </div>
                <div
                  onDrop={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setCreateDragActive(false)
                    if (!loading) selectCreateFiles(event.dataTransfer.files)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (!loading) setCreateDragActive(true)
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (!loading) setCreateDragActive(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                    setCreateDragActive(false)
                  }}
                  onClick={() => !loading && createUploadInputRef.current?.click()}
                  className={`mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition ${
                    createDragActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-blue-200 bg-white text-gray-500 hover:border-blue-400 hover:bg-blue-50/60'
                  } ${loading ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" />拖放文件到这里</span>
                </div>
                {createFiles.length > 0 && (
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto" aria-label="待上传文件">
                    {createFiles.map((file) => (
                      <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                        {file.type.startsWith('image/')
                          ? <ImageIcon className="h-5 w-5 shrink-0 text-blue-500" />
                          : <FileText className="h-5 w-5 shrink-0 text-slate-500" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800">{file.name}</div>
                          <div className="text-xs text-gray-400">{formatSize(file.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setCreateFiles((current) => current.filter((item) => item !== file))
                          }}
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">文档标题（可选）</label>
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={appInputClassName} placeholder="留空后自动生成" maxLength={200} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">关联产品（可选）</label>
                  <MaterialSearchSelect
                    value={form.materialId}
                    options={materials}
                    selectedOption={selectedMaterial}
                    onSearch={fetchMaterials}
                    onChange={(nextValue) => setForm({ ...form, materialId: nextValue })}
                    placeholder="输入产品编码、名称或规格搜索"
                    emptyLabel="不绑定产品（通用文档）"
                  />
                  {selectedMaterial?.spec && <div className="mt-1 text-xs text-gray-500">规格：{selectedMaterial.spec}</div>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">文档类别</label>
                  <SearchableSelect value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} options={availableCategoryOptions} placeholder="输入文档类别筛选" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">状态</label>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={appSelectClassName}>
                    {instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">版本</label>
                  <input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} className={appInputClassName} placeholder="v1" />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">适用工作中心</label>
                  <WorkCenterPicker options={workCenters} value={form.workCenterIds} onChange={(workCenterIds) => setForm({ ...form, workCenterIds })} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">备注</label>
                  <textarea rows={4} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={appTextareaClassName} placeholder="记录适用范围、注意事项、变更说明等通用信息" />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">在线正文</label>
                  <OnlineDocumentEditor value={form.contentJson} onChange={(contentJson) => setForm((current) => ({ ...current, contentJson }))} />
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                {createFiles.length > 0 ? `保存时将同时上传 ${createFiles.length} 个文件。` : '未选择文件时，可单独创建在线文档。'}
              </div>
        </ModalDialog>
      )}

      {detail && (
        <ModalDialog
          title={detail.title}
          description={getInstructionScopeLabel(detail)}
          size="wide"
          panelClassName="lg:max-w-[1440px]"
          bodyClassName="p-4 sm:p-6"
          onClose={closeDetail}
          headerActions={(
            <AppButton
              variant="secondary"
              size="sm"
              onClick={() => detailEditing ? cancelDetailEdit() : startDetailEdit(detail)}
            >
              {detailEditing ? '退出编辑' : '编辑文档'}
            </AppButton>
          )}
        >
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
                <section className={`${detailEditing ? 'order-1' : 'order-2'} space-y-3 lg:order-1`}>
                  {detailEditing ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                      <div className="mb-3 text-sm font-semibold text-gray-900">基础信息</div>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">文档标题（可选）</label>
                          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="留空后自动生成" maxLength={200} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">关联产品（可选）</label>
                          <MaterialSearchSelect
                            value={form.materialId}
                            options={materials}
                            selectedOption={selectedMaterial}
                            onSearch={fetchMaterials}
                            onChange={(nextValue) => setForm({ ...form, materialId: nextValue })}
                            placeholder="输入产品编码、名称或规格搜索"
                            emptyLabel="不绑定产品（通用文档）"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">文档类别</label>
                            <SearchableSelect value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} options={availableCategoryOptions} placeholder="输入文档类别筛选" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">状态</label>
                            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                              {instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">版本</label>
                            <input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">适用工作中心</label>
                          <WorkCenterPicker options={workCenters} value={form.workCenterIds} onChange={(workCenterIds) => setForm({ ...form, workCenterIds })} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">备注</label>
                          <textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={cancelDetailEdit} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
                        <button onClick={submitForm} disabled={loading} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                          {loading ? '保存中...' : '保存信息'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex flex-wrap gap-2">
                        <InstructionBadge>{documentCategoryLabel(detail.category)}</InstructionBadge>
                        <InstructionBadge tone={detail.status === 'ACTIVE' ? 'green' : detail.status === 'DRAFT' ? 'amber' : 'gray'}>{statusLabels[detail.status] || detail.status}</InstructionBadge>
                        <InstructionBadge tone="blue">{detail.version}</InstructionBadge>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-600">
                        <div>客户：{getInstructionCustomerName(detail)}</div>
                        <div>产品：{detail.material ? `${detail.material.code} · ${detail.material.name}` : '未绑定'}</div>
                        {detail.material?.spec && <div>规格：{detail.material.spec}</div>}
                        <div>工作中心：{detail.workCenters.length > 0 ? detail.workCenters.map((item) => `${item.code} · ${item.name}`).join('、') : '不限'}</div>
                        <div>创建时间：{formatDate(detail.createdAt)}</div>
                      </div>
                      {detail.note && <div className="mt-4 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{detail.note}</div>}
                    </div>
                  )}

                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    disabled={uploading}
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files
                      if (files) handleFiles(files)
                    }}
                  />
                  {detailAttachments.length > 0 && !focusUploadOnOpen ? (
                    <div ref={detailUploadRef} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">已上传 {detailAttachments.length} 个附件</div>
                        <div className="mt-1 text-xs text-gray-500">上传完成后在右侧展示新附件。</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={uploading}
                        className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploading ? '上传中...' : '添加附件'}
                      </button>
                    </div>
                  ) : (
                    <div ref={detailUploadRef} className="rounded-lg border-2 border-dashed border-green-300 bg-green-50/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">上传文档附件</h4>
                          <p className="mt-1 text-xs text-gray-500">支持 Word、Excel、PowerPoint、PDF、图片及其他附件，可一次选择多个文件。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={uploading}
                          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {uploading ? '上传中...' : '选择文件'}
                        </button>
                      </div>
                      <div
                        onDrop={(event: DragEvent<HTMLDivElement>) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setDragActive(false)
                          if (!uploading) handleFiles(event.dataTransfer.files)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (!uploading) setDragActive(true)
                        }}
                        onDragEnter={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (!uploading) setDragActive(true)
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                          setDragActive(false)
                        }}
                        onClick={() => !uploading && uploadInputRef.current?.click()}
                        className={`flex min-h-28 cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 py-4 text-center text-sm transition ${
                          dragActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-300 hover:bg-blue-50/50'
                        } ${uploading ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {uploading ? '上传中...' : '拖放文件到这里，或点击选择文件'}
                      </div>
                    </div>
                  )}
                </section>

                <section className={`${detailEditing ? 'order-2' : 'order-1'} min-w-0 space-y-5 lg:order-2`}>
                  {selectedDetailAttachment ? (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-500">附件预览 · {selectedDetailAttachmentIndex + 1}/{detailAttachments.length}</div>
                          <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{selectedDetailAttachment.originalName}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openViewer(detail, detailAttachments, selectedDetailAttachmentIndex)}
                            className="rounded-md border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                          >
                            全屏预览
                          </button>
                          <a href={`${selectedDetailAttachment.url}?download=1`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">下载原文件</a>
                        </div>
                      </div>
                      <div className="h-[min(58vh,640px)] min-h-[360px] bg-slate-950">
                        <DocumentFileViewer attachment={selectedDetailAttachment} />
                      </div>
                    </div>
                  ) : !detailEditing && !detail.contentText ? (
                    <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">上传附件后将在这里直接预览</div>
                  ) : null}

                  {(detailEditing || Boolean(detail.contentText)) && <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">在线正文</h4>
                      <span className="text-xs text-gray-500">{detailEditing ? '编辑模式' : detail.contentText ? '可在线阅读' : '暂无正文'}</span>
                    </div>
                    <OnlineDocumentEditor
                      value={detailEditing ? form.contentJson : detail.contentJson}
                      onChange={detailEditing ? (contentJson) => setForm((current) => ({ ...current, contentJson })) : undefined}
                      editable={detailEditing}
                      minHeight="20rem"
                    />
                  </div>}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">全部附件</h4>
                      <span className="text-xs text-gray-500">{detailAttachments.length} 个文件</span>
                    </div>
                  {detailAttachments.length === 0 ? (
                    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">暂无附件</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                      {detailAttachments.map((attachment, index) => (
                        <article key={attachment.id} className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 transition ${attachment.id === selectedDetailAttachment?.id ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedDetailAttachmentId(attachment.id)}
                            aria-pressed={attachment.id === selectedDetailAttachment?.id}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <DocumentPreviewThumb attachment={attachment} title={detail.title} className="w-20 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900">{attachment.originalName}</span>
                              <span className="mt-1 block text-xs text-gray-500">{attachmentTypeLabel(attachment.originalName, attachment.mimeType)} · {formatSize(attachment.size)} · {formatDate(attachment.createdAt)}</span>
                            </span>
                          </button>
                          <button onClick={() => archiveAttachment(attachment)} className="shrink-0 rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
                        </article>
                      ))}
                    </div>
                  )}
                  </div>
                </section>
              </div>
        </ModalDialog>
      )}

      {viewer && selectedViewerAttachment && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{viewer.instruction.title}</div>
              <div className="truncate text-xs text-white/60">{selectedViewerAttachment.originalName} · {viewer.index + 1}/{viewer.attachments.length}</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => setViewer({ ...viewer, index: Math.max(0, viewer.index - 1) })} disabled={viewer.index <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
              <button onClick={() => setViewer({ ...viewer, index: Math.min(viewer.attachments.length - 1, viewer.index + 1) })} disabled={viewer.index >= viewer.attachments.length - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
              {attachmentPreviewKind(selectedViewerAttachment.originalName, selectedViewerAttachment.mimeType) !== 'text' && attachmentPreviewKind(selectedViewerAttachment.originalName, selectedViewerAttachment.mimeType) !== 'none' && <>
                <button onClick={() => setViewerZoom((value) => Math.max(0.25, Number((value - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
                <button onClick={() => setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
                <button onClick={() => void saveSelectedAttachmentRotation(-90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">左转并保存</button>
                <button onClick={() => void saveSelectedAttachmentRotation(90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">右转并保存</button>
                <button onClick={() => setViewerZoom(1)} className="rounded border border-white/20 px-3 py-1.5 text-sm">适合页面</button>
              </>}
              <a href={`${selectedViewerAttachment.url}?download=1`} className="rounded border border-white/20 px-3 py-1.5 text-sm">下载原文件</a>
              <button onClick={() => setViewer(null)} className="rounded bg-white px-3 py-1.5 text-sm text-slate-900">关闭</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <DocumentFileViewer attachment={selectedViewerAttachment} zoom={viewerZoom} />
          </div>
          {['pdf', 'office'].includes(attachmentPreviewKind(selectedViewerAttachment.originalName, selectedViewerAttachment.mimeType)) && (
            <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
              多页文档可纵向滚动；Office 文件首次打开时由服务器生成 PDF 预览，原文件保持不变。
            </div>
          )}
        </div>
      )}
    </>
  )
}
