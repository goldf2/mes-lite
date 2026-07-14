'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useCompactViewport from './useCompactViewport'

interface Material {
  id: string
  code: string
  name: string
  spec: string
  note?: string | null
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote?: string
  costingMethod: string
  stock?: {
    qty: number
    reservedQty: number
    availableQty: number
    valuationQty: number
    reservedValuationQty: number
    availableValuationQty: number
    totalCost: number
    valuationUnitCost: number
    stockUnitCost: number
  }
  primaryImage?: { id: string; url: string; note?: string; mimeType: string; isCover: boolean } | null
  createdAt: string
}

interface Customer {
  id: string
  code: string
  name: string
}

interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

const materialCategoryOptions = [
  ['RAW', '原材料'],
  ['FINISHED', '成品'],
  ['AUXILIARY', '辅材'],
  ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'],
  ['PACKAGING', '包装物'],
  ['OTHER', '其他'],
] as const

const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

const materialSortOptions = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'code', label: '物料编码' },
  { value: 'name', label: '物料名称' },
  { value: 'category', label: '物料分类' },
  { value: 'spec', label: '规格' },
  { value: 'stockUnit', label: '库存单位' },
  { value: 'valuationUnit', label: '核算单位' },
  { value: 'costingMethod', label: '成本方法' },
] as const

type MaterialSortBy = (typeof materialSortOptions)[number]['value']
type SortDirection = 'asc' | 'desc'

const materialVisibleFieldOptions = [
  { key: 'image', label: '图片' },
  { key: 'code', label: '编码' },
  { key: 'category', label: '分类' },
  { key: 'customer', label: '客户' },
  { key: 'spec', label: '规格' },
  { key: 'note', label: '备注' },
  { key: 'stockUnit', label: '库存单位' },
  { key: 'valuationUnit', label: '核算单位' },
  { key: 'stock', label: '库存' },
  { key: 'valuationStock', label: '核算库存' },
  { key: 'createdAt', label: '创建时间' },
] as const

type MaterialVisibleField = (typeof materialVisibleFieldOptions)[number]['key']

const defaultMaterialVisibleFields: MaterialVisibleField[] = [
  'image',
  'code',
  'category',
  'customer',
  'spec',
  'stockUnit',
  'valuationUnit',
  'stock',
  'valuationStock',
  'createdAt',
]

function createEmptyMaterialForm() {
  return {
    code: '',
    name: '',
    spec: '',
    note: '',
    category: 'RAW',
    customerId: '',
    unit: '',
    stockUnit: '',
    useDualUnit: false,
    valuationUnit: '',
    conversionRate: 1,
    conversionNote: '',
    costingMethod: 'WEIGHTED_AVERAGE',
  }
}

function MaterialFieldVisibilityControl({
  value,
  onChange,
}: {
  value: MaterialVisibleField[]
  onChange: (next: MaterialVisibleField[]) => void
}) {
  const selected = new Set(value)
  const allSelected = value.length === materialVisibleFieldOptions.length

  const toggleAll = () => {
    onChange(allSelected ? [] : materialVisibleFieldOptions.map((option) => option.key))
  }

  const toggleField = (field: MaterialVisibleField) => {
    if (selected.has(field)) {
      onChange(value.filter((item) => item !== field))
      return
    }
    onChange([...value, field])
  }

  return (
    <div className="inline-flex max-w-none flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
      <label className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        显示全部
      </label>
      {materialVisibleFieldOptions.map((option) => (
        <label key={option.key} className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
          <input
            type="checkbox"
            checked={selected.has(option.key)}
            onChange={() => toggleField(option.key)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

function MaterialPagination({
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
      <div className="whitespace-nowrap">
        共 {pagination.total} 条，当前 {start}-{end} 条，第 {currentPage}/{totalPages} 页
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
          <option value={200}>200 条/页</option>
        </select>
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          首页
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          末页
        </button>
      </div>
    </div>
  )
}

export default function MaterialPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(materialCategoryFilterOptions.map((option) => option.value))
  const [sortBy, setSortBy] = useState<MaterialSortBy>('createdAt')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<Material | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materials.viewMode', 'list')
  const [visibleFields, setVisibleFields] = useState<MaterialVisibleField[]>(defaultMaterialVisibleFields)
  const isCompactViewport = useCompactViewport()
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [form, setForm] = useState(createEmptyMaterialForm())
  const showField = (field: MaterialVisibleField) => visibleFields.includes(field)
  const [loading, setLoading] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip')
  const [importLoading, setImportLoading] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])

  useEffect(() => {
    fetchMaterials()
  }, [keyword, selectedCategories, customerFilter, sortBy, sortDir, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategories, customerFilter, sortBy, sortDir, pageSize])

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('mes-lite.materials.visibleFields')
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      const allowed = new Set(materialVisibleFieldOptions.map((option) => option.key))
      if (Array.isArray(parsed)) {
        const next = parsed.filter((item): item is MaterialVisibleField => allowed.has(item))
        setVisibleFields(next)
      }
    } catch (err) {
      // ignore invalid local preference
    }
  }, [])

  const updateVisibleFields = (next: MaterialVisibleField[]) => {
    setVisibleFields(next)
    window.localStorage.setItem('mes-lite.materials.visibleFields', JSON.stringify(next))
  }

  const buildMaterialParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    if (keyword) params.set('keyword', keyword)
    if (customerFilter) params.set('customerId', customerFilter)
    const categoryQuery = getMultiSelectQuery('categories', selectedCategories, materialCategoryFilterOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    return params
  }

  const fetchMaterials = async () => {
    const params = buildMaterialParams()
    const url = params.toString() ? `/api/materials?${params.toString()}` : '/api/materials'
    const res = await fetch(url)
    const data = await res.json()
    const nextMaterials: Material[] = data.data || []
    const nextPagination = data.pagination || { page, pageSize, total: nextMaterials.length, totalPages: 1 }
    setMaterials(nextMaterials)
    setPagination(nextPagination)
    if (nextPagination.total > 0 && nextPagination.page > nextPagination.totalPages) {
      setPage(nextPagination.totalPages)
    }
    setDetailMaterial((current) => current ? nextMaterials.find((item) => item.id === current.id) || current : null)
  }

  const downloadFile = async (url: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        onMessage(data.error || '下载失败')
        return
      }

      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const disposition = res.headers.get('Content-Disposition') || ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'materials.csv'
      const link = document.createElement('a')
      link.href = href
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      onMessage('下载失败')
    }
  }

  const handleExport = () => {
    const params = buildMaterialParams()
    const url = params.toString() ? `/api/materials/export?${params.toString()}` : '/api/materials/export'
    downloadFile(url)
  }

  const handleDownloadTemplate = () => {
    downloadFile('/api/materials/import-template')
  }

  const openImportModal = () => {
    setImportFile(null)
    setImportMode('skip')
    setImportErrors([])
    setShowImportModal(true)
  }

  const handleImportSubmit = async () => {
    if (!importFile) {
      onMessage('请先选择 CSV 文件')
      return
    }

    setImportLoading(true)
    setImportErrors([])
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await fetch(`/api/materials/import?mode=${importMode}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        const summary = data.data || {}
        onMessage(`导入完成：共 ${summary.total || 0} 行，新增 ${summary.created || 0}，更新 ${summary.updated || 0}，跳过 ${summary.skipped || 0}`)
        setShowImportModal(false)
        setImportFile(null)
        setPage(1)
        fetchMaterials()
      } else {
        setImportErrors(data.details || [data.error || '导入失败'])
      }
    } catch (err) {
      setImportErrors(['导入失败'])
    }
    setImportLoading(false)
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

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.stockUnit || (form.useDualUnit && (!form.valuationUnit || form.conversionRate <= 0))) {
      onMessage('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      const payload = {
        code: form.code,
        name: form.name,
        spec: form.spec,
        note: form.note,
        category: form.category,
        customerId: form.customerId || undefined,
        unit: form.stockUnit,
        stockUnit: form.stockUnit,
        valuationUnit: form.useDualUnit ? form.valuationUnit : form.stockUnit,
        conversionRate: form.useDualUnit ? form.conversionRate : 1,
        conversionNote: form.conversionNote || undefined,
        costingMethod: form.costingMethod,
      }
      if (editingMaterial) {
        const res = await fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: editingMaterial.id }),
        })
        const data = await res.json()
        if (res.ok) {
          onMessage('物料更新成功')
        } else {
          onMessage(data.error || '更新失败')
        }
      } else {
        const res = await fetch('/api/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (res.ok) {
          onMessage('物料创建成功')
        } else {
          onMessage(data.error || '创建失败')
        }
      }
      setShowModal(false)
      setForm(createEmptyMaterialForm())
      setEditingMaterial(null)
      setPage(1)
      fetchMaterials()
    } catch (err) {
      onMessage('操作失败')
    }
    setLoading(false)
  }

  const handleArchive = async (id: string) => {
    if (!confirm('确定要归档该物料吗？归档后不会在物料列表中显示，可在归档记录中恢复。')) return
    try {
      const res = await fetch(`/api/materials/${id}/archive`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '归档成功')
        fetchMaterials()
      } else {
        onMessage(data.error || '归档失败')
      }
    } catch (err) {
      onMessage('归档失败')
    }
  }

  const handleEdit = (material: Material) => {
    const stockUnit = material.stockUnit || material.unit
    const valuationUnit = material.valuationUnit || material.unit
    const useDualUnit = valuationUnit !== stockUnit || Number(material.conversionRate || 1) !== 1
    setEditingMaterial(material)
    setForm({
      code: material.code,
      name: material.name,
      spec: material.spec,
      note: material.note || '',
      category: material.category || 'RAW',
      customerId: material.customerId || '',
      unit: stockUnit,
      stockUnit,
      useDualUnit,
      valuationUnit: useDualUnit ? valuationUnit : '',
      conversionRate: material.conversionRate || 1,
      conversionNote: material.conversionNote || '',
      costingMethod: material.costingMethod || 'WEIGHTED_AVERAGE',
    })
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingMaterial(null)
    setForm(createEmptyMaterialForm())
    setShowModal(true)
  }

  const handleViewDetail = async (material: Material) => {
    try {
      const res = await fetch(`/api/materials?keyword=${encodeURIComponent(material.code)}&pageSize=20`)
      const data = await res.json()
      const freshMaterial = (data.data || []).find((item: Material) => item.id === material.id)
      setDetailMaterial(freshMaterial || material)
    } catch (error) {
      setDetailMaterial(material)
    }
  }

  const handleEditFromDetail = () => {
    if (!detailMaterial) return
    const material = detailMaterial
    setDetailMaterial(null)
    handleEdit(material)
  }

  const handleAttachmentMessage = (message: string) => {
    onMessage(message)
    fetchMaterials()
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        filters={(
          <>
            <StatusCheckboxFilter
              options={materialCategoryFilterOptions}
              value={selectedCategories}
              onChange={setSelectedCategories}
              allLabel="全部分类"
            />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索物料名称或编码"
              className="w-56 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部客户</option>
              <option value="__UNASSIGNED__">通用/未绑定</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as MaterialSortBy)}
                className="w-40 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                {materialSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>按{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((current) => current === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {sortDir === 'asc' ? '升序' : '降序'}
              </button>
            </div>
            <MaterialFieldVisibilityControl
              value={visibleFields}
              onChange={updateVisibleFields}
            />
          </>
        )}
        actions={(
          <>
            <div className="hidden sm:block">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <button
              onClick={handleAdd}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
            >
              新增
            </button>
            <button
              onClick={openImportModal}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-50 transition sm:px-4 sm:py-2 sm:text-sm"
            >
              导入
            </button>
            <button
              onClick={handleExport}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition sm:px-4 sm:py-2 sm:text-sm"
            >
              导出
            </button>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedCategories, keyword, customerFilter, customers, sortBy, sortDir, viewMode, setViewMode, visibleFields])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          filters={(
            <>
              <StatusCheckboxFilter
                options={materialCategoryFilterOptions}
                value={selectedCategories}
                onChange={setSelectedCategories}
                allLabel="全部分类"
              />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索物料名称或编码"
                className="w-56 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部客户</option>
                <option value="__UNASSIGNED__">通用/未绑定</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
              <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as MaterialSortBy)}
                  className="w-40 px-4 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {materialSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>按{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((current) => current === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  {sortDir === 'asc' ? '升序' : '降序'}
                </button>
              </div>
              <MaterialFieldVisibilityControl
                value={visibleFields}
                onChange={updateVisibleFields}
              />
            </>
          )}
          actions={(
            <>
              <div className="hidden sm:block">
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
              <button
                onClick={handleAdd}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                新增
              </button>
              <button
                onClick={openImportModal}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-50 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                导入
              </button>
              <button
                onClick={handleExport}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                导出
              </button>
            </>
          )}
        />
      </TopBarPortal>
      <div className="rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-6 sm:shadow">
        {materials.length === 0 ? (
          <div className="rounded-lg bg-white py-10 text-center text-gray-500 shadow sm:bg-transparent sm:py-12 sm:shadow-none">
            <p>暂无物料</p>
            <button
              onClick={handleAdd}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              创建第一个物料
            </button>
          </div>
        ) : effectiveViewMode === 'card' ? (
          <>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {materials.map((material) => (
                <div key={material.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:shadow-none">
                <div className="flex gap-3">
                  {showField('image') && (
                    <button
                      onClick={() => handleViewDetail(material)}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
                      title={material.primaryImage?.note || '查看物料详情'}
                    >
                      {material.primaryImage ? (
                        <img src={material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">暂无</span>
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {showField('code') && <span className="rounded bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">{material.code}</span>}
                      {showField('category') && <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</span>}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-gray-900 sm:text-base">{material.name}</div>
                    {showField('spec') && <div className="mt-0.5 truncate text-sm text-gray-500">{material.spec || '无规格'}</div>}
                    {showField('note') && material.note && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">备注：{material.note}</div>}
                    {showField('customer') && <div className="mt-0.5 truncate text-xs text-gray-500">客户：{material.customer ? `${material.customer.name} (${material.customer.code})` : '通用/未绑定'}</div>}
                  </div>
                </div>
                {(showField('stock') || showField('valuationStock')) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    {showField('stock') && (
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-xs text-gray-500">库存</div>
                        <div className="mt-1 font-semibold text-gray-900">{material.stock?.qty || 0} {material.stockUnit || material.unit}</div>
                      </div>
                    )}
                    {showField('valuationStock') && (
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-xs text-gray-500">核算库存</div>
                        <div className="mt-1 font-semibold text-green-700">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</div>
                      </div>
                    )}
                  </div>
                )}
                {(showField('valuationUnit') || showField('createdAt')) && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    {showField('valuationUnit') && <span className="whitespace-nowrap">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</span>}
                    {showField('valuationUnit') && <span className="whitespace-nowrap">{material.costingMethod === 'FIFO' ? 'FIFO' : '移动加权'}</span>}
                    {showField('createdAt') && <span className="whitespace-nowrap">{new Date(material.createdAt).toLocaleDateString('zh-CN')}</span>}
                  </div>
                )}
                <div className="mt-auto flex justify-end gap-2 pt-3">
                  <button
                    onClick={() => handleViewDetail(material)}
                    className="px-2.5 py-1 text-gray-700 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={() => handleArchive(material.id)}
                    className="px-2.5 py-1 text-amber-700 border border-amber-300 rounded text-xs hover:bg-amber-50 transition"
                  >
                    归档
                  </button>
                </div>
                </div>
              ))}
            </div>
            <MaterialPagination
              pagination={pagination}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-max">
              <thead className="bg-gray-50">
                <tr>
                  {showField('image') && <th className="w-20 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>}
                  {showField('code') && <th className="w-36 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">物料编码</th>}
                  <th className="w-36 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">物料名称</th>
                  {showField('category') && <th className="w-24 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">分类</th>}
                  {showField('customer') && <th className="w-44 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">归属客户</th>}
                  {showField('spec') && <th className="w-32 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">规格</th>}
                  {showField('note') && <th className="w-56 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">备注</th>}
                  {showField('stockUnit') && <th className="w-24 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">库存单位</th>}
                  {showField('valuationUnit') && <th className="w-48 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">核算单位</th>}
                  {showField('stock') && <th className="w-28 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">库存</th>}
                  {showField('valuationStock') && <th className="w-28 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">核算库存</th>}
                  {showField('createdAt') && <th className="w-32 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>}
                  <th className="w-32 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((material) => (
                  <tr key={material.id} className="align-top hover:bg-gray-50">
                    {showField('image') && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDetail(material)}
                          className="h-12 w-12 overflow-hidden rounded border border-gray-200 bg-gray-50"
                          title={material.primaryImage?.note || '查看物料详情'}
                        >
                          {material.primaryImage ? (
                            <img src={material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400">暂无</span>
                          )}
                        </button>
                      </td>
                    )}
                    {showField('code') && <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-blue-600">{material.code}</td>}
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{material.name}</td>
                    {showField('category') && <td className="whitespace-nowrap px-4 py-3 text-sm">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</td>}
                    {showField('customer') && <td className="px-4 py-3 text-sm">{material.customer ? `${material.customer.name} (${material.customer.code})` : '通用/未绑定'}</td>}
                    {showField('spec') && <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{material.spec || '-'}</td>}
                    {showField('note') && <td className="max-w-xs px-4 py-3 text-sm text-gray-500">{material.note || '-'}</td>}
                    {showField('stockUnit') && <td className="whitespace-nowrap px-4 py-3 text-sm">{material.stockUnit || material.unit}</td>}
                    {showField('valuationUnit') && (
                      <td className="px-4 py-3 text-sm">
                        <div className="whitespace-nowrap">{material.valuationUnit || material.unit}</div>
                        <div className="whitespace-nowrap text-xs text-gray-500">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</div>
                        <div className="whitespace-nowrap text-xs text-gray-500">成本法：{material.costingMethod === 'FIFO' ? '先入先出' : '移动加权平均'}</div>
                      </td>
                    )}
                    {showField('stock') && <td className="whitespace-nowrap px-4 py-3 text-sm">{material.stock?.qty || 0} {material.stockUnit || material.unit}</td>}
                    {showField('valuationStock') && <td className="whitespace-nowrap px-4 py-3 text-sm text-green-600">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</td>}
                    {showField('createdAt') && <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{new Date(material.createdAt).toLocaleString('zh-CN')}</td>}
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => handleViewDetail(material)}
                        className="px-3 py-1 text-gray-700 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
                      >
                        查看详情
                      </button>
                      <button
                        onClick={() => handleArchive(material.id)}
                        className="ml-2 px-3 py-1 text-amber-700 border border-amber-300 rounded text-xs hover:bg-amber-50 transition"
                      >
                        归档
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <MaterialPagination
              pagination={pagination}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editingMaterial ? '编辑物料' : '新增物料'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-5">
                <section className="space-y-3">
                  <h4 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">基础信息</h4>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">物料编码 *</label>
                      <input
                        type="text"
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                        placeholder="如：MAT-001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">物料名称 *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                        placeholder="如：GCr15 轴承钢"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">规格</label>
                      <input
                        type="text"
                        value={form.spec}
                        onChange={(e) => setForm({ ...form, spec: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                        placeholder="如：Φ30mm 圆钢"
                      />
                    </div>
                    <div className="md:col-span-2 xl:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                      <textarea
                        value={form.note}
                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                        className="min-h-20 w-full resize-y px-4 py-2 border border-gray-200 rounded-lg"
                        placeholder="可记录客户零件号说明、图纸版本、特殊检验要求等"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">物料分类</label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      >
                        {materialCategoryOptions.map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">归属客户</label>
                      <select
                        value={form.customerId}
                        onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      >
                        <option value="">通用/未绑定客户</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">成本核算方法</label>
                      <select
                        value={form.costingMethod}
                        onChange={(e) => setForm({ ...form, costingMethod: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      >
                        <option value="WEIGHTED_AVERAGE">移动加权平均</option>
                        <option value="FIFO">先入先出 FIFO</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">单位与换算</h4>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">库存/领料单位 *</label>
                      <input
                        type="text"
                        value={form.stockUnit}
                        onChange={(e) => setForm({ ...form, stockUnit: e.target.value, unit: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                        placeholder="如：根、米、件、kg"
                      />
                    </div>
                    <label className="flex min-h-[42px] items-center gap-2 self-end rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 xl:col-span-2">
                      <input
                        type="checkbox"
                        checked={form.useDualUnit}
                        onChange={(e) => setForm({
                          ...form,
                          useDualUnit: e.target.checked,
                          valuationUnit: e.target.checked ? form.valuationUnit : '',
                          conversionRate: e.target.checked ? form.conversionRate : 1,
                          conversionNote: e.target.checked ? form.conversionNote : '',
                        })}
                        className="h-4 w-4"
                      />
                      启用双单位制（库存单位与成本单位不同）
                    </label>
                  </div>
                  {form.useDualUnit && (
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">计价/核算单位 *</label>
                        <input
                          type="text"
                          value={form.valuationUnit}
                          onChange={(e) => setForm({ ...form, valuationUnit: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          placeholder="如：kg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">换算系数 *</label>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={form.conversionRate || ''}
                          onChange={(e) => setForm({ ...form, conversionRate: Number(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          placeholder="例如：2.35"
                        />
                        <p className="mt-1 text-xs text-gray-500">1 {form.stockUnit || '库存单位'} = {form.conversionRate || 0} {form.valuationUnit || '核算单位'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">换算说明</label>
                        <input
                          type="text"
                          value={form.conversionNote}
                          onChange={(e) => setForm({ ...form, conversionNote: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          placeholder="如：按理论重量，实际称重可在来料单修正"
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
            <div className="flex shrink-0 gap-3 border-t bg-white px-6 py-4">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleSubmit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">批量导入物料</h3>
                <p className="mt-1 text-sm text-gray-500">仅导入物料主数据，不导入库存数量和成本。</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                物料编码是业务可视化编码，必须唯一；规格用于记录尺寸、材质、版本等描述。库存初始化请到库存管理做存货调整。
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">CSV 文件</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    下载导入模板
                  </button>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">遇到已有物料编码</label>
                  <select
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value as 'skip' | 'update')}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm"
                  >
                    <option value="skip">跳过已有物料</option>
                    <option value="update">更新已有物料资料</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500">更新模式只覆盖名称、规格、分类、客户、单位和成本方法，不修改库存余额。</p>
                </div>
              </div>
              {importErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <div className="text-sm font-semibold text-red-700">导入失败</div>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-red-700">
                    {importErrors.map((error, index) => (
                      <li key={`${error}-${index}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-3 border-t bg-white px-6 py-4">
              <button onClick={() => setShowImportModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleImportSubmit} disabled={importLoading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {importLoading ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailMaterial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b">
              <h3 className="text-base font-semibold text-gray-900">物料详情</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleEditFromDetail}
                  className="px-3 py-2 text-sm text-blue-700 border border-blue-300 rounded-md hover:bg-blue-50"
                >
                  编辑资料
                </button>
                <button
                  onClick={() => setDetailMaterial(null)}
                  className="h-9 w-9 flex-shrink-0 text-2xl text-gray-400 hover:text-gray-700"
                  aria-label="关闭详情"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
                <a
                  href={detailMaterial.primaryImage?.url}
                  target={detailMaterial.primaryImage ? '_blank' : undefined}
                  rel={detailMaterial.primaryImage ? 'noreferrer' : undefined}
                  className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-gray-100"
                >
                  {detailMaterial.primaryImage ? (
                    <img
                      src={detailMaterial.primaryImage.url}
                      alt={detailMaterial.primaryImage.note || detailMaterial.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">暂无物料图片</span>
                  )}
                </a>

                <div className="min-w-0">
                  <div className="border-b border-gray-200 pb-5">
                    <div className="font-mono text-sm text-blue-700">{detailMaterial.code}</div>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900">{detailMaterial.name}</h2>
                    <p className="mt-2 text-sm text-gray-600">规格：{detailMaterial.spec || '-'}</p>
                    {detailMaterial.note && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">备注：{detailMaterial.note}</p>}
                    <p className="mt-1 text-sm text-gray-600">分类：{materialCategoryLabels[detailMaterial.category || 'RAW'] || '其他'}</p>
                    <p className="mt-1 text-sm text-gray-600">归属客户：{detailMaterial.customer ? `${detailMaterial.customer.name} (${detailMaterial.customer.code})` : '通用/未绑定'}</p>
                  </div>

                  <dl className="grid grid-cols-3 border-b border-gray-200 py-5">
                    <div>
                      <dt className="text-xs text-gray-500">当前库存</dt>
                      <dd className="mt-2 text-xl font-semibold text-gray-900">{detailMaterial.stock?.qty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                    <div className="border-l border-gray-200 pl-5">
                      <dt className="text-xs text-gray-500">已占用</dt>
                      <dd className="mt-2 text-xl font-semibold text-gray-900">{detailMaterial.stock?.reservedQty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                    <div className="border-l border-gray-200 pl-5">
                      <dt className="text-xs text-gray-500">可用库存</dt>
                      <dd className="mt-2 text-xl font-semibold text-green-700">{detailMaterial.stock?.availableQty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                  </dl>

                  <dl className="grid grid-cols-2 gap-5 pt-5">
                    <div>
                      <dt className="text-xs text-gray-500">计价/核算单位</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">核算库存</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.stock?.valuationQty || 0} {detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">换算关系</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">1 {detailMaterial.stockUnit || detailMaterial.unit} = {detailMaterial.conversionRate || 1} {detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">成本方法</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.costingMethod === 'FIFO' ? '先入先出 FIFO' : '移动加权平均'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">当前平均成本</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">
                        ¥{(detailMaterial.stock?.valuationUnitCost || 0).toFixed(4)} / {detailMaterial.valuationUnit}
                        <span className="ml-2 text-gray-500">¥{(detailMaterial.stock?.stockUnitCost || 0).toFixed(4)} / {detailMaterial.stockUnit || detailMaterial.unit}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">创建时间</dt>
                      <dd className="mt-1 text-sm text-gray-900">{new Date(detailMaterial.createdAt).toLocaleString('zh-CN')}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <AttachmentPanel
                ownerType="MATERIAL"
                ownerId={detailMaterial.id}
                title="图片资料"
                variant="image"
                documentType="MATERIAL_IMAGE"
                layout="gallery"
                allowCover
                onMessage={handleAttachmentMessage}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
