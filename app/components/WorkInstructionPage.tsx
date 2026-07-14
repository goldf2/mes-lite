'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useCompactViewport from './useCompactViewport'

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

interface AttachmentItem {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  note?: string | null
  documentType: string
  isCover: boolean
  createdAt: string
}

interface WorkInstruction {
  id: string
  code: string
  title: string
  category: string
  version: string
  status: string
  customerId?: string | null
  customer?: Customer | null
  materialId?: string | null
  material?: MaterialOption | null
  processName?: string | null
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
  code: string
  title: string
  category: string
  version: string
  status: string
  customerId: string
  materialId: string
  processName: string
  note: string
}

const instructionCategoryOptions = [
  { value: 'PROCESS', label: '工艺作业' },
  { value: 'QUALITY', label: '质量检验' },
  { value: 'PACKAGING', label: '包装发货' },
  { value: 'SAFETY', label: '安全操作' },
  { value: 'MAINTENANCE', label: '设备维护' },
  { value: 'OTHER', label: '其他' },
]

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

const categoryLabels = Object.fromEntries(instructionCategoryOptions.map((item) => [item.value, item.label]))
const statusLabels = Object.fromEntries(instructionStatusOptions.map((item) => [item.value, item.label]))

function createEmptyForm(): WorkInstructionForm {
  return {
    code: `WI-${Date.now().toString().slice(-8)}`,
    title: '',
    category: 'PROCESS',
    version: 'v1',
    status: 'ACTIVE',
    customerId: '',
    materialId: '',
    processName: '',
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

function FilePreviewThumb({ attachment, title }: { attachment?: AttachmentItem | null; title: string }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
      {attachment ? (
        attachment.mimeType.startsWith('image/') ? (
          <img src={attachment.url} alt={attachment.note || title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-50 text-red-700">
            <span className="text-lg font-semibold">PDF</span>
            <span className="max-w-[80%] truncate text-xs">{attachment.originalName}</span>
          </div>
        )
      ) : (
        <span className="text-sm text-gray-400">暂无文件</span>
      )}
    </div>
  )
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

function MaterialSearchSelect({
  value,
  options,
  selectedOption,
  onChange,
  onSearch,
  placeholder = '输入物料编码或名称搜索',
  emptyLabel = '不绑定物料',
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
  const rootRef = useRef<HTMLDivElement | null>(null)
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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return
      setOpen(false)
      setQuery('')
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selectMaterial = (material: MaterialOption | null, nextValue?: string) => {
    onChange(nextValue ?? material?.id ?? '', material)
    setOpen(false)
    setQuery('')
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
            setOpen(false)
            setQuery('')
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
            <div className="px-3 py-3 text-sm text-gray-400">没有匹配物料</div>
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

export default function WorkInstructionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [items, setItems] = useState<WorkInstruction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedCategories, setSelectedCategories] = useState(instructionCategoryOptions.map((item) => item.value))
  const [selectedStatuses, setSelectedStatuses] = useState(instructionStatusOptions.map((item) => item.value))
  const [customerFilter, setCustomerFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [fileType, setFileType] = useState<'all' | 'image' | 'pdf'>('all')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.workInstructions.viewMode', 'card')
  const isCompactViewport = useCompactViewport()
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [showModal, setShowModal] = useState(false)
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
  const [viewerRotation, setViewerRotation] = useState(0)
  const [focusUploadOnOpen, setFocusUploadOnOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const detailUploadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetchInstructions()
  }, [keyword, selectedCategories, selectedStatuses, customerFilter, materialFilter, fileType, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategories, selectedStatuses, customerFilter, materialFilter, fileType, pageSize])

  useEffect(() => {
    fetchCustomers()
    fetchMaterials()
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

  const buildParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (customerFilter) params.set('customerId', customerFilter)
    if (materialFilter) params.set('materialId', materialFilter)
    if (fileType !== 'all') params.set('fileType', fileType)
    const categoryQuery = getMultiSelectQuery('categories', selectedCategories, instructionCategoryOptions)
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
        onMessage(data.error || '获取作业指导书失败')
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
      onMessage('获取作业指导书失败')
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

  const openAddModal = () => {
    setEditing(null)
    setDetailEditing(false)
    setForm(createEmptyForm())
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
      code: instruction.code,
      title: instruction.title,
      category: instruction.category || 'PROCESS',
      version: instruction.version || 'v1',
      status: instruction.status || 'ACTIVE',
      customerId: instruction.customerId || '',
      materialId: instruction.materialId || '',
      processName: instruction.processName || '',
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
    if (!form.code.trim() || !form.title.trim()) {
      onMessage('请填写编码和标题')
      return
    }

    setLoading(true)
    try {
      const payload = {
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category,
        version: form.version.trim() || 'v1',
        status: form.status,
        customerId: form.customerId || undefined,
        materialId: form.materialId || undefined,
        processName: form.processName.trim() || undefined,
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
        onMessage(editing ? '作业指导书已更新' : '作业指导书已创建，请上传图片或 PDF')
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
    if (!confirm(`确定归档作业指导书 ${instruction.code} 吗？`)) return
    try {
      const res = await fetch(`/api/work-instructions?id=${instruction.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '作业指导书已归档')
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
    setViewerRotation(0)
  }

  const selectedViewerAttachment = viewer?.attachments[viewer.index]
  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === form.materialId),
    [materials, form.materialId]
  )
  const selectedFilterMaterial = useMemo(
    () => materials.find((material) => material.id === materialFilter),
    [materials, materialFilter]
  )

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={(
        <>
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索编码、标题、物料或工序"
            className="w-full min-w-[180px] max-w-[280px] flex-[1_1_220px] rounded-lg border border-gray-200 px-4 py-2 text-sm"
          />
          <StatusCheckboxFilter
            options={instructionCategoryOptions}
            value={selectedCategories}
            onChange={setSelectedCategories}
            allLabel="全部类型"
            storageKey="mes-lite.filters.workInstructions.category.order"
          />
          <StatusCheckboxFilter
            options={instructionStatusOptions}
            value={selectedStatuses}
            onChange={setSelectedStatuses}
            allLabel="全部状态"
            storageKey="mes-lite.filters.workInstructions.status.order"
          />
        </>
      )}
      filters={(
        <>
          <select
            value={fileType}
            onChange={(event) => setFileType(event.target.value as 'all' | 'image' | 'pdf')}
            className="w-36 rounded-lg border border-gray-200 px-4 py-2 text-sm"
          >
            {fileTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            className="w-48 rounded-lg border border-gray-200 px-4 py-2 text-sm"
          >
            <option value="">全部客户</option>
            <option value="__UNASSIGNED__">通用/未绑定</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
          <div className="w-64">
            <MaterialSearchSelect
              value={materialFilter}
              options={materials}
              selectedOption={selectedFilterMaterial}
              onChange={(nextValue) => setMaterialFilter(nextValue)}
              onSearch={fetchMaterials}
              placeholder="筛选关联物料"
              emptyLabel="全部物料"
              unassignedLabel="未绑定物料"
            />
          </div>
        </>
      )}
      actions={(
        <>
          <div className="hidden sm:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="shrink-0 whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 sm:px-4 sm:py-2 sm:text-sm"
          >
            新增
          </button>
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
            <p>暂无作业指导书</p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
            >
              新建第一份指导书
            </button>
          </div>
        ) : effectiveViewMode === 'card' ? (
          <>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((instruction) => (
                <article key={instruction.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:shadow-none">
                  <button
                    type="button"
                    onClick={() => openDetail(instruction)}
                    className="text-left"
                  >
                    <FilePreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} />
                  </button>
                  <div className="mt-3 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <InstructionBadge tone="blue">{instruction.code}</InstructionBadge>
                      <InstructionBadge>{categoryLabels[instruction.category] || instruction.category}</InstructionBadge>
                      <InstructionBadge tone={instruction.status === 'ACTIVE' ? 'green' : instruction.status === 'DRAFT' ? 'amber' : 'gray'}>
                        {statusLabels[instruction.status] || instruction.status}
                      </InstructionBadge>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{instruction.title}</h3>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      <div className="truncate">版本：{instruction.version || '-'}</div>
                      <div className="truncate">物料：{instruction.material ? `${instruction.material.code} · ${instruction.material.name}` : '未绑定'}</div>
                      <div className="truncate">客户：{instruction.customer?.name || instruction.material?.customer?.name || '通用/未绑定'}</div>
                      <div className="truncate">工序：{instruction.processName || '-'}</div>
                      <div>文件：{instruction.imageCount} 图 / {instruction.pdfCount} PDF</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(instruction)}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() => archiveInstruction(instruction)}
                      className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 transition hover:bg-amber-50"
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
              <table className="w-full min-w-[1040px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-24 px-4 py-3 text-left text-sm font-semibold text-gray-600">预览</th>
                    <th className="w-36 px-4 py-3 text-left text-sm font-semibold text-gray-600">编码</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">标题</th>
                    <th className="w-28 px-4 py-3 text-left text-sm font-semibold text-gray-600">类型</th>
                    <th className="w-24 px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                    <th className="w-44 px-4 py-3 text-left text-sm font-semibold text-gray-600">关联物料</th>
                    <th className="w-36 px-4 py-3 text-left text-sm font-semibold text-gray-600">客户</th>
                    <th className="w-28 px-4 py-3 text-left text-sm font-semibold text-gray-600">文件</th>
                    <th className="w-36 px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((instruction) => (
                    <tr key={instruction.id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => openDetail(instruction)} className="block h-14 w-20 overflow-hidden rounded">
                          <FilePreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} />
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-blue-700">{instruction.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{instruction.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{instruction.version || '-'} · {instruction.processName || '未绑定工序'}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{categoryLabels[instruction.category] || instruction.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{statusLabels[instruction.status] || instruction.status}</td>
                      <td className="px-4 py-3 text-sm">{instruction.material ? `${instruction.material.code} · ${instruction.material.name}` : '-'}</td>
                      <td className="px-4 py-3 text-sm">{instruction.customer?.name || instruction.material?.customer?.name || '通用/未绑定'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{instruction.imageCount} 图 / {instruction.pdfCount} PDF</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button onClick={() => openDetail(instruction)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">打开</button>
                        <button onClick={() => archiveInstruction(instruction)} className="ml-2 rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">新增作业指导书</h3>
              <button onClick={() => setShowModal(false)} className="text-2xl text-gray-400 hover:text-gray-700">&times;</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">指导书编码 *</label>
                  <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">标题 *</label>
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2" placeholder="如：CNC 铝件首件检验作业指导书" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">类型</label>
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2">
                    {instructionCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">状态</label>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2">
                    {instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">版本</label>
                  <input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2" placeholder="v1" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">客户</label>
                  <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2">
                    <option value="">通用/未绑定客户</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">关联物料</label>
                  <MaterialSearchSelect
                    value={form.materialId}
                    options={materials}
                    selectedOption={selectedMaterial}
                    onSearch={fetchMaterials}
                    onChange={(nextValue, material) => {
                      setForm({
                        ...form,
                        materialId: nextValue,
                        customerId: form.customerId || material?.customerId || '',
                      })
                    }}
                    placeholder="输入物料编码、名称或规格搜索"
                    emptyLabel="不绑定物料"
                  />
                  {selectedMaterial?.spec && <div className="mt-1 text-xs text-gray-500">规格：{selectedMaterial.spec}</div>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">适用工序</label>
                  <input value={form.processName} onChange={(event) => setForm({ ...form, processName: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2" placeholder="如：CNC 精加工、终检、包装" />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-gray-700">备注</label>
                  <textarea rows={4} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2" placeholder="记录适用范围、注意事项或变更说明" />
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                新建指导书先保存基础信息，保存成功后会自动打开上传区域。
              </div>
            </div>
            <div className="flex shrink-0 gap-3 border-t bg-white px-6 py-4">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">取消</button>
              <button onClick={submitForm} disabled={loading} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
                {loading ? '保存中...' : '保存并上传文件'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${detailFullscreen ? 'bg-white p-0' : 'bg-black/50 p-3 sm:p-4'}`}>
          <div className={`flex flex-col overflow-hidden bg-white shadow-xl ${detailFullscreen ? 'h-screen w-screen' : 'max-h-[92vh] w-full max-w-6xl rounded-lg'}`}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="font-mono text-sm text-blue-700">{detail.code}</div>
                <h3 className="truncate text-lg font-semibold text-gray-900">{detail.title}</h3>
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
                          <label className="mb-1 block text-xs font-medium text-gray-600">指导书编码 *</label>
                          <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">标题 *</label>
                          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">类型</label>
                            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                              {instructionCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
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
                          <label className="mb-1 block text-xs font-medium text-gray-600">客户</label>
                          <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                            <option value="">通用/未绑定客户</option>
                            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">关联物料</label>
                          <MaterialSearchSelect
                            value={form.materialId}
                            options={materials}
                            selectedOption={selectedMaterial}
                            onSearch={fetchMaterials}
                            onChange={(nextValue, material) => {
                              setForm({
                                ...form,
                                materialId: nextValue,
                                customerId: form.customerId || material?.customerId || '',
                              })
                            }}
                            placeholder="输入物料编码、名称或规格搜索"
                            emptyLabel="不绑定物料"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">适用工序</label>
                          <input value={form.processName} onChange={(event) => setForm({ ...form, processName: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
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
                        <InstructionBadge>{categoryLabels[detail.category] || detail.category}</InstructionBadge>
                        <InstructionBadge tone={detail.status === 'ACTIVE' ? 'green' : detail.status === 'DRAFT' ? 'amber' : 'gray'}>{statusLabels[detail.status] || detail.status}</InstructionBadge>
                        <InstructionBadge tone="blue">{detail.version}</InstructionBadge>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-600">
                        <div>客户：{detail.customer?.name || detail.material?.customer?.name || '通用/未绑定'}</div>
                        <div>物料：{detail.material ? `${detail.material.code} · ${detail.material.name}` : '未绑定'}</div>
                        {detail.material?.spec && <div>规格：{detail.material.spec}</div>}
                        <div>工序：{detail.processName || '-'}</div>
                        <div>创建时间：{formatDate(detail.createdAt)}</div>
                      </div>
                      {detail.note && <div className="mt-4 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{detail.note}</div>}
                    </div>
                  )}

                  <div ref={detailUploadRef} className="rounded-lg border-2 border-dashed border-green-300 bg-green-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">上传指导书文件</h4>
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
                            <FilePreviewThumb attachment={attachment} title={detail.title} />
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
              {selectedViewerAttachment.mimeType.startsWith('image/') && (
                <>
                  <button onClick={() => setViewerZoom((value) => Math.max(0.25, Number((value - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
                  <button onClick={() => setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
                  <button onClick={() => setViewerRotation((value) => value - 90)} className="rounded border border-white/20 px-3 py-1.5 text-sm">左转</button>
                  <button onClick={() => setViewerRotation((value) => value + 90)} className="rounded border border-white/20 px-3 py-1.5 text-sm">右转</button>
                  <button onClick={() => { setViewerZoom(1); setViewerRotation(0) }} className="rounded border border-white/20 px-3 py-1.5 text-sm">复位</button>
                </>
              )}
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
                    transform: `rotate(${viewerRotation}deg) scale(${viewerZoom})`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            ) : (
              <iframe
                src={selectedViewerAttachment.url}
                title={selectedViewerAttachment.originalName}
                className="h-full w-full border-0 bg-white"
              />
            )}
          </div>
          {selectedViewerAttachment.mimeType === 'application/pdf' && (
            <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
              PDF 多页由浏览器内置阅读器滚动显示。
            </div>
          )}
        </div>
      )}
    </>
  )
}
