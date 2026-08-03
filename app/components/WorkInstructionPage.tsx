'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import DocumentPreviewThumb from './DocumentPreviewThumb'
import PdfDocumentViewer from './PdfDocumentViewer'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'
import DocumentCategoryManagerModal, {
  DocumentCategoryItem,
  documentCategoryLabel,
  documentCategoryOptions,
} from './DocumentCategoryManagerModal'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import { appInputClassName, appSelectClassName, appTextareaClassName } from './FormField'
import AppButton from './AppButton'

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
  version: string
  status: string
  materialId: string
  material: MaterialOption
  workCenters: WorkCenterOption[]
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
  categoryId: string
  version: string
  status: string
  materialId: string
  workCenterIds: string[]
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
] as const

const statusLabels = Object.fromEntries(instructionStatusOptions.map((item) => [item.value, item.label]))

function createEmptyForm(): WorkInstructionForm {
  return {
    categoryId: '',
    version: 'v1',
    status: 'ACTIVE',
    materialId: '',
    workCenterIds: [],
    note: '',
  }
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
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
  return instruction.material.customer?.name || '通用产品'
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
    <div className="space-y-2">
      <SearchableSelect
        value=""
        onChange={(id) => id && onChange([...value, id])}
        options={available}
        placeholder={available.length > 0 ? '输入工作中心筛选并添加' : '已选择全部工作中心'}
      />
      <div className="flex min-h-8 flex-wrap gap-2">
        {selected.length === 0 ? <span className="text-xs text-gray-400">未指定时表示不限制工作中心</span> : selected.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
            {item.code} · {item.name}
            <button type="button" onClick={() => onChange(value.filter((id) => id !== item.id))} className="ml-1 text-blue-400 hover:text-blue-800" aria-label={`移除${item.name}`}>×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function WorkInstructionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [items, setItems] = useState<WorkInstruction[]>([])
  const [categories, setCategories] = useState<DocumentCategoryItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[] | null>(null)
  const [selectedStatuses, setSelectedStatuses] = useState(instructionStatusOptions.map((item) => item.value))
  const [customerFilter, setCustomerFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [fileType, setFileType] = useState<'all' | 'image' | 'pdf'>('all')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.workInstructions.viewMode', 'card')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [showModal, setShowModal] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [editing, setEditing] = useState<WorkInstruction | null>(null)
  const [detailEditing, setDetailEditing] = useState(false)
  const [detailFullscreen, setDetailFullscreen] = useState(false)
  const [form, setForm] = useState<WorkInstructionForm>(createEmptyForm())
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WorkInstruction | null>(null)
  const [detailAttachments, setDetailAttachments] = useState<AttachmentItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [viewer, setViewer] = useState<{ instruction: WorkInstruction; attachments: AttachmentItem[]; index: number } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [focusUploadOnOpen, setFocusUploadOnOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const detailUploadRef = useRef<HTMLDivElement | null>(null)
  const availableCategoryOptions = useMemo(() => documentCategoryOptions(categories), [categories])
  const effectiveSelectedCategoryIds = selectedCategoryIds ?? availableCategoryOptions.map((option) => option.value)
  const instructionSort = useClientTableSort(items, {
    code: (instruction) => instruction.material.code,
    name: (instruction) => instruction.material.name,
    category: (instruction) => documentCategoryLabel(instruction.category),
    status: (instruction) => statusLabels[instruction.status] || instruction.status,
    customer: (instruction) => getInstructionCustomerName(instruction),
    files: (instruction) => instruction.attachmentCount,
    workCenters: (instruction) => instruction.workCenters.map((item) => `${item.code} ${item.name}`).join(' '),
  }, 'code', 'asc')

  useEffect(() => {
    fetchInstructions()
  }, [keyword, selectedCategoryIds, selectedStatuses, customerFilter, materialFilter, fileType, page, pageSize, availableCategoryOptions.length])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategoryIds, selectedStatuses, customerFilter, materialFilter, fileType, pageSize])

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
      const availableIds = new Set(nextCategories.map((category) => category.id))
      setCategories(nextCategories)
      setSelectedCategoryIds((current) => current === null ? null : current.filter((id) => availableIds.has(id)))
    } catch (err) {
      onMessage('获取文档类别失败')
    }
  }

  const buildParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (customerFilter) params.set('customerId', customerFilter)
    if (materialFilter) params.set('materialId', materialFilter)
    if (fileType !== 'all') params.set('fileType', fileType)
    const categoryQuery = getMultiSelectQuery('categoryIds', effectiveSelectedCategoryIds, availableCategoryOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    const statusQuery = getMultiSelectQuery('statuses', selectedStatuses, instructionStatusOptions)
    if (statusQuery) {
      const statusParams = new URLSearchParams(statusQuery)
      statusParams.forEach((value, key) => params.set(key, value))
    }
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
        setDetailAttachments(data.data || [])
      }
    } catch (err) {
      setDetailAttachments([])
    }
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
    setShowModal(true)
  }

  const openDetail = (instruction: WorkInstruction, focusUpload = false) => {
    ensureMaterialOption(instruction.material)
    setFocusUploadOnOpen(focusUpload)
    setDetailEditing(false)
    setDetailFullscreen(false)
    setDetail(instruction)
  }

  const startDetailEdit = (instruction: WorkInstruction) => {
    ensureMaterialOption(instruction.material)
    setEditing(instruction)
    setForm({
      categoryId: instruction.categoryId,
      version: instruction.version || 'v1',
      status: instruction.status || 'ACTIVE',
      materialId: instruction.materialId,
      workCenterIds: instruction.workCenters.map((item) => item.id),
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
    setDetailFullscreen(false)
    setDetailEditing(false)
    setEditing(null)
  }

  const submitForm = async () => {
    if (!form.materialId) {
      onMessage('请选择关联产品')
      return
    }
    if (!form.categoryId) {
      onMessage('请选择文档类别')
      return
    }

    setLoading(true)
    try {
      const payload = {
        materialId: form.materialId,
        categoryId: form.categoryId,
        version: form.version.trim() || 'v1',
        status: form.status,
        workCenterIds: form.workCenterIds,
        note: form.note.trim() || undefined,
      }
      const res = await fetch('/api/work-instructions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      })
      const data = await res.json()
      if (res.ok) {
        const savedInstruction = data.data
        const wasEditing = Boolean(editing)
        onMessage(editing ? '产品文档已更新' : '产品文档已创建，请上传图片或 PDF')
        setShowModal(false)
        setEditing(null)
        setDetailEditing(false)
        if (wasEditing && savedInstruction && detail?.id === savedInstruction.id) {
          setDetail({ ...detail, ...savedInstruction })
        }
        if (!editing && data.data) {
          const createdInstruction: WorkInstruction = {
            ...data.data,
            attachmentCount: 0,
            imageCount: 0,
            pdfCount: 0,
            primaryAttachment: null,
          }
          ensureMaterialOption(createdInstruction.material)
          setDetail(createdInstruction)
          setDetailAttachments([])
          setFocusUploadOnOpen(true)
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
    if (!confirm(`确定归档产品 ${instruction.material.code} 的这条文档吗？`)) return
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
    const acceptedFiles = selectedFiles.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf')
    if (acceptedFiles.length === 0) {
      onMessage('请上传图片或 PDF 文件')
      return
    }

    setUploading(true)
    try {
      for (const file of acceptedFiles) {
        const formData = new FormData()
        formData.append('ownerType', 'WORK_INSTRUCTION')
        formData.append('ownerId', detail.id)
        formData.append('documentType', 'WORK_INSTRUCTION')
        formData.append('file', file)

        const res = await fetch('/api/attachments', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          onMessage(data.error || `${file.name} 上传失败`)
        }
      }
      onMessage('文件上传完成')
      await fetchAttachments(detail.id)
      await fetchInstructions()
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

  const openInstructionViewer = async (instruction: WorkInstruction) => {
    if (instruction.attachmentCount === 0) {
      onMessage('这条产品文档还没有上传图片或 PDF')
      return
    }
    try {
      const res = await fetch(`/api/attachments?ownerType=WORK_INSTRUCTION&ownerId=${encodeURIComponent(instruction.id)}`)
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取产品文档文件失败')
        return
      }
      const attachments = (data.data || []) as AttachmentItem[]
      if (attachments.length === 0) {
        if (instruction.primaryAttachment) {
          openViewer(instruction, [instruction.primaryAttachment])
          return
        }
        onMessage('这条产品文档还没有上传图片或 PDF')
        return
      }
      openViewer(instruction, attachments)
    } catch (err) {
      onMessage('获取产品文档文件失败')
    }
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
  const selectedFilterMaterial = useMemo(
    () => materials.find((material) => material.id === materialFilter),
    [materials, materialFilter]
  )
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (effectiveSelectedCategoryIds.length !== availableCategoryOptions.length) {
      labels.push(effectiveSelectedCategoryIds.length === 0 ? '无类型' : `${effectiveSelectedCategoryIds.length} 类`)
    }
    if (selectedStatuses.length !== instructionStatusOptions.length) {
      labels.push(selectedStatuses.length === 0 ? '无状态' : `${selectedStatuses.length} 状态`)
    }
    if (fileType !== 'all') labels.push(fileTypeOptions.find((option) => option.value === fileType)?.label || fileType)
    if (customerFilter) {
      labels.push(customerFilter === '__UNASSIGNED__' ? '通用/未绑定' : customers.find((customer) => customer.id === customerFilter)?.name || '指定客户')
    }
    if (materialFilter) {
      labels.push(selectedFilterMaterial ? selectedFilterMaterial.name : '指定产品')
    }
    return labels
  }, [effectiveSelectedCategoryIds, availableCategoryOptions.length, selectedStatuses, fileType, customerFilter, materialFilter, customers, selectedFilterMaterial])

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={(
        <SearchFieldWithPresets
          storageKey="mes-lite.searchPresets.documents"
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索产品、文档类别或备注"
        />
      )}
      filterCount={activeFilterLabels.length}
      filterSummary={activeFilterLabels.slice(0, 3).map((label) => (
        <span key={label} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{label}</span>
      ))}
      filters={(
        <>
          <StatusCheckboxFilter
            options={availableCategoryOptions}
            value={effectiveSelectedCategoryIds}
            onChange={setSelectedCategoryIds}
            allLabel="全部文档类别"
          />
          <StatusCheckboxFilter
            options={instructionStatusOptions}
            value={selectedStatuses}
            onChange={setSelectedStatuses}
            allLabel="全部状态"
          />
          <select
            value={fileType}
            onChange={(event) => setFileType(event.target.value as 'all' | 'image' | 'pdf')}
            className="w-36 rounded-lg border border-gray-200 px-4 py-2 text-sm"
          >
            {fileTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <SearchableSelect
            value={customerFilter}
            onChange={setCustomerFilter}
            options={[
              { value: '__UNASSIGNED__', label: '通用/未绑定' },
              ...customers.map((customer) => ({ value: customer.id, label: customer.name, keywords: customer.code })),
            ]}
            placeholder="输入客户名称筛选（全部客户）"
            allowClear
            className="w-56"
          />
          <div className="w-64">
            <MaterialSearchSelect
              value={materialFilter}
              options={materials}
              selectedOption={selectedFilterMaterial}
              onChange={(nextValue) => setMaterialFilter(nextValue)}
              onSearch={fetchMaterials}
              placeholder="筛选关联产品"
              emptyLabel="全部产品"
            />
          </div>
        </>
      )}
      actions={(
        <>
          <button
            type="button"
            onClick={() => setShowCategoryManager(true)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50 sm:px-4 sm:py-2 sm:text-sm"
          >
            类别管理
          </button>
          <div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <AppButton
            variant="create"
            onClick={openAddModal}
          >
            新增
          </AppButton>
        </>
      )}
    />
  )

  return (
    <>
      <TopBarPortal>{toolbar}</TopBarPortal>

      <div className="rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-6 sm:shadow">
        {items.length === 0 ? (
          <div className="rounded-lg bg-white py-10 text-center text-gray-500 shadow sm:bg-transparent sm:py-12 sm:shadow-none">
            <p>暂无产品文档</p>
            <AppButton
              variant="create"
              onClick={openAddModal}
              className="mt-4"
            >
              新增第一条产品文档
            </AppButton>
          </div>
        ) : viewMode === 'card' ? (
          <>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {instructionSort.sortedRows.map((instruction) => (
                <article key={instruction.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:shadow-none">
                  <button
                    type="button"
                    onClick={() => instruction.attachmentCount > 0 ? void openInstructionViewer(instruction) : openDetail(instruction, true)}
                    className="text-left"
                  >
                    <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.material.name} />
                  </button>
                  <div className="mt-3 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <InstructionBadge tone="blue">{instruction.material.code}</InstructionBadge>
                      <InstructionBadge>{documentCategoryLabel(instruction.category)}</InstructionBadge>
                      <InstructionBadge tone={instruction.status === 'ACTIVE' ? 'green' : instruction.status === 'DRAFT' ? 'amber' : 'gray'}>
                        {statusLabels[instruction.status] || instruction.status}
                      </InstructionBadge>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{instruction.material.name}</h3>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      <div className="truncate">版本：{instruction.version || '-'}</div>
                      {instruction.material.spec && <div className="truncate">规格：{instruction.material.spec}</div>}
                      <div className="truncate">客户：{getInstructionCustomerName(instruction)}</div>
                      <div className="line-clamp-2">工作中心：{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div>
                      <div>文件：{instruction.imageCount} 图 / {instruction.pdfCount} PDF</div>
                      {instruction.note && <div className="line-clamp-2">备注：{instruction.note}</div>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openInstructionViewer(instruction)}
                      disabled={instruction.attachmentCount === 0}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      全屏打开
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
                    <SortableTableHeader column="code" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort} className="w-44">产品编码</SortableTableHeader>
                    <SortableTableHeader column="name" activeColumn={instructionSort.sortColumn} direction={instructionSort.sortDirection} onSort={instructionSort.toggleSort}>产品名称</SortableTableHeader>
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
                          onClick={() => instruction.attachmentCount > 0 ? void openInstructionViewer(instruction) : openDetail(instruction, true)}
                          className="block h-14 w-20 overflow-hidden rounded"
                        >
                          <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.material.name} />
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-blue-700">{instruction.material.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{instruction.material.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{instruction.version || '-'}</div>
                        {instruction.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">备注：{instruction.note}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{documentCategoryLabel(instruction.category)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{statusLabels[instruction.status] || instruction.status}</td>
                      <td className="px-4 py-3 text-sm">{getInstructionCustomerName(instruction)}</td>
                      <td className="px-4 py-3 text-sm"><div className="line-clamp-2">{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{instruction.imageCount} 图 / {instruction.pdfCount} PDF</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openInstructionViewer(instruction)}
                            disabled={instruction.attachmentCount === 0}
                            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                          >
                            全屏打开
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
          title="新增产品文档"
          description="关联产品后保存，再上传图片或 PDF 文件。"
          onClose={() => setShowModal(false)}
          closeDisabled={loading}
          size="xl"
          footer={(
            <ModalActions
              onCancel={() => setShowModal(false)}
              onConfirm={submitForm}
              confirmLabel="保存并上传文件"
              busy={loading}
            />
          )}
        >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">关联产品 *</label>
                  <MaterialSearchSelect
                    value={form.materialId}
                    options={materials}
                    selectedOption={selectedMaterial}
                    onSearch={fetchMaterials}
                    onChange={(nextValue) => setForm({ ...form, materialId: nextValue })}
                    placeholder="输入产品编码、名称或规格搜索"
                    emptyLabel="请选择产品"
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
              </div>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                选择产品并保存后，系统会自动打开图片或 PDF 上传区域。
              </div>
        </ModalDialog>
      )}

      {detail && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${detailFullscreen ? 'bg-white p-0' : 'mes-modal-overlay p-3 sm:p-4'}`}>
          <div className={`flex flex-col overflow-hidden bg-white shadow-xl ${detailFullscreen ? 'h-screen w-screen' : 'max-h-[92vh] w-full max-w-6xl rounded-lg'}`}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="font-mono text-sm text-blue-700">{detail.material.code}</div>
                <h3 className="truncate text-lg font-semibold text-gray-900">{detail.material.name}</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={detailFullscreen}
                    onChange={(event) => setDetailFullscreen(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  全屏显示
                </label>
                <button
                  onClick={() => detailEditing ? cancelDetailEdit() : startDetailEdit(detail)}
                  className={`rounded-md px-3 py-2 text-sm ${
                    detailEditing ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'border border-blue-300 text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  {detailEditing ? '退出编辑' : '编辑信息'}
                </button>
                <button onClick={closeDetail} className="h-9 w-9 text-2xl text-gray-400 hover:text-gray-700" aria-label="关闭详情">&times;</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className={`grid grid-cols-1 gap-5 ${detailFullscreen ? 'xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]'}`}>
                <section className="space-y-3">
                  {detailEditing ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                      <div className="mb-3 text-sm font-semibold text-gray-900">基础信息</div>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">关联产品 *</label>
                          <MaterialSearchSelect
                            value={form.materialId}
                            options={materials}
                            selectedOption={selectedMaterial}
                            onSearch={fetchMaterials}
                            onChange={(nextValue) => setForm({ ...form, materialId: nextValue })}
                            placeholder="输入产品编码、名称或规格搜索"
                            emptyLabel="请选择产品"
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
                        <div>产品：{detail.material.code} · {detail.material.name}</div>
                        {detail.material?.spec && <div>规格：{detail.material.spec}</div>}
                        <div>工作中心：{detail.workCenters.length > 0 ? detail.workCenters.map((item) => `${item.code} · ${item.name}`).join('、') : '不限'}</div>
                        <div>创建时间：{formatDate(detail.createdAt)}</div>
                      </div>
                      {detail.note && <div className="mt-4 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{detail.note}</div>}
                    </div>
                  )}

                  <div ref={detailUploadRef} className="rounded-lg border-2 border-dashed border-green-300 bg-green-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">上传产品文档文件</h4>
                        <p className="mt-1 text-xs text-gray-500">支持图片和 PDF，可一次选择多个文件。</p>
                      </div>
                      <label className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                        {uploading ? '上传中...' : '选择文件'}
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          disabled={uploading}
                          className="hidden"
                          onChange={(event) => {
                            const files = event.target.files
                            if (files) handleFiles(files)
                          }}
                        />
                      </label>
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
                      {uploading ? '上传中...' : '拖放图片或 PDF 到这里，或点击选择文件'}
                    </div>
                  </div>
                </section>

                <section className="min-w-0">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">文件展示</h4>
                    <span className="text-xs text-gray-500">{detailAttachments.length} 个文件</span>
                  </div>
                  {detailAttachments.length === 0 ? (
                    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">暂无图片或 PDF</div>
                  ) : (
                    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${detailFullscreen ? 'xl:grid-cols-3 2xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
                      {detailAttachments.map((attachment, index) => (
                        <article key={attachment.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <button
                            type="button"
                            onClick={() => openViewer(detail, detailAttachments, index)}
                            className="block w-full text-left"
                          >
                            <DocumentPreviewThumb attachment={attachment} title={detail.material.name} />
                          </button>
                          <div className="p-3">
                            <div className="truncate text-sm font-medium text-gray-900">{attachment.originalName}</div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                              <span>{attachment.mimeType === 'application/pdf' ? 'PDF' : '图片'} · {formatSize(attachment.size)}</span>
                              <span>{formatDate(attachment.createdAt)}</span>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button onClick={() => openViewer(detail, detailAttachments, index)} className="rounded border border-blue-300 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50">打开</button>
                              <button onClick={() => archiveAttachment(attachment)} className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      <DocumentCategoryManagerModal
        open={showCategoryManager}
        categories={categories}
        onClose={() => setShowCategoryManager(false)}
        onChanged={async () => {
          await fetchCategories()
          await fetchInstructions()
        }}
        onMessage={onMessage}
      />

      {viewer && selectedViewerAttachment && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{viewer.instruction.material.code} · {viewer.instruction.material.name}</div>
              <div className="truncate text-xs text-white/60">{selectedViewerAttachment.originalName} · {viewer.index + 1}/{viewer.attachments.length}</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => setViewer({ ...viewer, index: Math.max(0, viewer.index - 1) })} disabled={viewer.index <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
              <button onClick={() => setViewer({ ...viewer, index: Math.min(viewer.attachments.length - 1, viewer.index + 1) })} disabled={viewer.index >= viewer.attachments.length - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
              <button onClick={() => setViewerZoom((value) => Math.max(0.25, Number((value - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
              <button onClick={() => setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
              <button onClick={() => void saveSelectedAttachmentRotation(-90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">左转并保存</button>
              <button onClick={() => void saveSelectedAttachmentRotation(90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">右转并保存</button>
              <button onClick={() => setViewerZoom(1)} className="rounded border border-white/20 px-3 py-1.5 text-sm">适合页面</button>
              <a href={selectedViewerAttachment.url} target="_blank" rel="noreferrer" className="rounded border border-white/20 px-3 py-1.5 text-sm">新窗口</a>
              <button onClick={() => setViewer(null)} className="rounded bg-white px-3 py-1.5 text-sm text-slate-900">关闭</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedViewerAttachment.mimeType.startsWith('image/') ? (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                <img
                  src={selectedViewerAttachment.url}
                  alt={selectedViewerAttachment.originalName}
                  className="max-h-full max-w-full object-contain"
                  style={{
                    transform: `rotate(${selectedViewerAttachment.rotation || 0}deg) scale(${viewerZoom})`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            ) : (
              <PdfDocumentViewer
                url={selectedViewerAttachment.url}
                title={selectedViewerAttachment.originalName}
                rotation={selectedViewerAttachment.rotation}
                zoom={viewerZoom}
              />
            )}
          </div>
          {selectedViewerAttachment.mimeType === 'application/pdf' && (
            <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
              PDF 多页可纵向滚动；方向调整会保存到当前文件，并同步用于卡片预览和产品全景图。
            </div>
          )}
        </div>
      )}
    </>
  )
}
