'use client'

import { CSSProperties, ReactNode, useCallback, useState, useEffect, useMemo, useRef } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useCompactViewport from './useCompactViewport'
import MaterialPanoramaPage from './MaterialPanoramaPage'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

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

interface BomMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  unit: string
  stockUnit: string
  valuationUnit: string
}

interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  wastageRate: number
  cutLengthMm?: number | null
  cutTolerancePlusMm?: number | null
  cutToleranceMinusMm?: number | null
  material?: BomMaterialOption | null
}

interface MaterialBom {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  sourceMaterialId?: string
  bom?: {
    id: string
    version: string
    isActive: boolean
    outputQuantity: number
    outputUnit: string
    items: BomItem[]
  } | null
}

interface DraftBomItem {
  clientId: string
  materialId: string
  quantity: number
  unit: string
  wastageRate: number
  cutLengthMm: number | null
  cutTolerancePlusMm: number | null
  cutToleranceMinusMm: number | null
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
const materialProductPrefix = 'material:'
const materialSplitStorageKey = 'mes-lite.materials.splitPercent'
const bomSummaryFieldsStorageKey = 'mes-lite.materials.bomSummaryFields'

const materialSortOptions = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'code', label: '物料编码' },
  { value: 'name', label: '物料名称' },
  { value: 'category', label: '物料分类' },
  { value: 'customer', label: '归属客户' },
  { value: 'spec', label: '规格' },
  { value: 'note', label: '备注' },
  { value: 'stockUnit', label: '库存单位' },
  { value: 'valuationUnit', label: '核算单位' },
  { value: 'costingMethod', label: '成本方法' },
  { value: 'stock', label: '库存数量' },
  { value: 'valuationStock', label: '核算库存' },
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

const bomSummaryFieldOptions = [
  { key: 'name', label: '物料名称' },
  { key: 'spec', label: '规格' },
  { key: 'code', label: '编码' },
  { key: 'quantity', label: '每件用量' },
  { key: 'unit', label: '单位' },
  { key: 'wastageRate', label: '损耗率' },
] as const

type BomSummaryField = (typeof bomSummaryFieldOptions)[number]['key']
const defaultBomSummaryFields: BomSummaryField[] = ['name', 'spec']

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

function BomSummaryVisibilityControl({
  value,
  onChange,
}: {
  value: BomSummaryField[]
  onChange: (next: BomSummaryField[]) => void
}) {
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => setOpen(false), [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = new Set(value)

  const toggleField = (field: BomSummaryField) => {
    if (selected.has(field)) {
      if (value.length === 1) return
      onChange(value.filter((item) => item !== field))
      return
    }
    onChange([...value, field])
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
      >
        BOM 简况配置
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
          <div className="px-2 pb-2 text-xs text-gray-500">选择简况中显示的内容</div>
          {bomSummaryFieldOptions.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">
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
      )}
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

function MaterialSortableHeader({
  field,
  label,
  sortBy,
  sortDir,
  className,
  onSort,
}: {
  field: MaterialSortBy
  label: string
  sortBy: MaterialSortBy
  sortDir: SortDirection
  className: string
  onSort: (field: MaterialSortBy) => void
}) {
  const active = sortBy === field

  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${className} whitespace-nowrap px-4 py-3 text-left text-sm font-semibold`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`group flex w-full items-center gap-1 text-left transition ${active ? 'text-blue-700' : 'text-gray-600 hover:text-blue-700'}`}
        title={`按${label}${active && sortDir === 'asc' ? '降序' : '升序'}排列`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={`text-xs ${active ? 'text-blue-600' : 'text-gray-300 group-hover:text-blue-400'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function qty(value: number, digits = 3) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

function materialOptionLabel(material: BomMaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function BomMaterialSelectSearch({
  value,
  materials,
  disabledIds,
  onChange,
}: {
  value: string
  materials: BomMaterialOption[]
  disabledIds: string[]
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const disabled = new Set(disabledIds)
  const selected = materials.find((material) => material.id === value)
  const keyword = query.trim().toLowerCase()
  const filtered = materials.filter((material) => {
    if (!keyword) return true
    return `${material.code} ${material.name} ${material.spec || ''} ${materialCategoryLabels[material.category] || material.category}`.toLowerCase().includes(keyword)
  }).slice(0, 60)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? materialOptionLabel(selected) : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder="输入物料编码、名称或规格筛选"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((material) => {
              const disabledOption = disabled.has(material.id)
              return (
                <button
                  key={material.id}
                  type="button"
                  disabled={disabledOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(material.id)
                    closePopup()
                  }}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 ${value === material.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-gray-500">{material.code}</span>
                      <span className="ml-2">{material.name}</span>
                      {material.spec && <span className="ml-2 text-xs text-gray-500">{material.spec}</span>}
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{material.stockUnit || material.unit}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function BomProductSearch({
  value,
  products,
  disabledIds,
  onChange,
}: {
  value: string
  products: MaterialBom[]
  disabledIds: string[]
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const disabled = new Set(disabledIds)
  const selected = products.find((product) => product.id === value)
  const keyword = query.trim().toLowerCase()
  const filtered = products.filter((product) => {
    if (!keyword) return true
    return `${product.sku} ${product.name} ${materialCategoryLabels[product.category] || product.category}`.toLowerCase().includes(keyword)
  }).slice(0, 60)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? `${selected.sku} · ${selected.name}` : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder="输入产品物料编码或名称筛选"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((product) => {
              const disabledOption = disabled.has(product.id) || disabled.has(product.sourceMaterialId || '')
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={disabledOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(product.id)
                    closePopup()
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-gray-500">{product.sku}</span>
                      <span className="ml-2">{product.name}</span>
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{product.unit}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function MaterialPage({
  onMessage,
  onToolbarChange,
  showBomWorkspace = false,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  showBomWorkspace?: boolean
}) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bomProducts, setBomProducts] = useState<MaterialBom[]>([])
  const [bomMaterialOptions, setBomMaterialOptions] = useState<BomMaterialOption[]>([])
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [draftBomItems, setDraftBomItems] = useState<DraftBomItem[]>([])
  const [relationProductId, setRelationProductId] = useState('')
  const [relationMaterialId, setRelationMaterialId] = useState('')
  const [relationProductQty, setRelationProductQty] = useState(1)
  const [relationMaterialQty, setRelationMaterialQty] = useState(1)
  const [relationWastageRate, setRelationWastageRate] = useState(0)
  const [bomLoading, setBomLoading] = useState(false)
  const [bomSaving, setBomSaving] = useState(false)
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
  const [panoramaMaterialId, setPanoramaMaterialId] = useState<string | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materials.viewMode', 'list')
  const [visibleFields, setVisibleFields] = useState<MaterialVisibleField[]>(defaultMaterialVisibleFields)
  const [bomSummaryFields, setBomSummaryFields] = useState<BomSummaryField[]>(defaultBomSummaryFields)
  const [splitPercent, setSplitPercent] = useState(46)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const [bomAuxiliaryView, setBomAuxiliaryView] = useState<'components' | 'usage'>('components')
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const isCompactViewport = useCompactViewport()
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [form, setForm] = useState(createEmptyMaterialForm())
  const showField = (field: MaterialVisibleField) => visibleFields.includes(field)
  const [loading, setLoading] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip')
  const [importLoading, setImportLoading] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) || null
  const bomProductByMaterialId = useMemo(() => new Map(bomProducts.map((product) => [product.sourceMaterialId || product.id.replace(materialProductPrefix, ''), product])), [bomProducts])
  const selectedBomProduct = selectedMaterial ? bomProductByMaterialId.get(selectedMaterial.id) || null : null
  const relationProduct = bomProducts.find((product) => product.id === relationProductId) || null
  const relationMaterial = bomMaterialOptions.find((material) => material.id === relationMaterialId) || null
  const relationProductSourceMaterialId = relationProduct?.sourceMaterialId || relationProduct?.id.replace(materialProductPrefix, '') || ''
  const bomMaterialById = useMemo(() => new Map(bomMaterialOptions.map((material) => [material.id, material])), [bomMaterialOptions])
  const selectedBomMaterialItems = useMemo(() => (
    selectedBomProduct?.bom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
  ), [selectedBomProduct])
  const selectedMaterialUsageRows = useMemo(() => {
    if (!selectedMaterial) return []
    return bomProducts.flatMap((product) => (product.bom?.items || [])
      .filter((item) => item.itemType === 'MATERIAL' && item.material?.id === selectedMaterial.id)
      .map((item) => ({ product, item })))
  }, [bomProducts, selectedMaterial])
  const relationUnitQty = Number(relationProductQty || 0) > 0 ? Number(relationMaterialQty || 0) / Number(relationProductQty || 0) : 0

  const fetchBomData = useCallback(async () => {
    setBomLoading(true)
    try {
      const res = await fetch('/api/boms')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 关系失败')
        return
      }
      setBomProducts(data.products || [])
      setBomMaterialOptions(data.materialOptions || [])
    } catch (err) {
      onMessage('获取 BOM 关系失败')
    } finally {
      setBomLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    fetchMaterials()
  }, [keyword, selectedCategories, customerFilter, sortBy, sortDir, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategories, customerFilter, sortBy, sortDir, pageSize])

  useEffect(() => {
    fetchCustomers()
    if (showBomWorkspace) fetchBomData()
  }, [fetchBomData, showBomWorkspace])

  useEffect(() => {
    if (!selectedMaterialId && materials[0]) {
      setSelectedMaterialId(materials[0].id)
      return
    }
    if (selectedMaterialId && !materials.some((material) => material.id === selectedMaterialId) && materials[0]) {
      setSelectedMaterialId(materials[0].id)
    }
  }, [materials, selectedMaterialId])

  useEffect(() => {
    setDraftBomItems(selectedBomMaterialItems.map((item) => ({
      clientId: item.id,
      materialId: item.material?.id || '',
      quantity: Number(item.quantity || 0),
      unit: item.material?.stockUnit || item.material?.unit || '件',
      wastageRate: Number(item.wastageRate || 0),
      cutLengthMm: item.cutLengthMm == null ? null : Number(item.cutLengthMm),
      cutTolerancePlusMm: item.cutTolerancePlusMm == null ? null : Number(item.cutTolerancePlusMm),
      cutToleranceMinusMm: item.cutToleranceMinusMm == null ? null : Number(item.cutToleranceMinusMm),
    })))
  }, [selectedBomMaterialItems])

  useEffect(() => {
    if (!selectedMaterial) return
    if (!relationProductId && !relationMaterialId) {
      if (selectedMaterial.category === 'FINISHED') {
        setRelationProductId(`${materialProductPrefix}${selectedMaterial.id}`)
      } else {
        setRelationMaterialId(selectedMaterial.id)
      }
    }
  }, [relationMaterialId, relationProductId, selectedMaterial])

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

  useEffect(() => {
    const saved = window.localStorage.getItem(bomSummaryFieldsStorageKey)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      const allowed = new Set<BomSummaryField>(bomSummaryFieldOptions.map((option) => option.key))
      if (Array.isArray(parsed)) {
        const next = parsed.filter((item): item is BomSummaryField => allowed.has(item))
        if (next.length > 0) setBomSummaryFields(next)
      }
    } catch (err) {
      // ignore invalid local preference
    }
  }, [])

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(materialSplitStorageKey))
    if (Number.isFinite(saved) && saved >= 28 && saved <= 70) {
      setSplitPercent(saved)
    }
  }, [])

  useEffect(() => {
    if (!isResizingSplit) return

    const handlePointerMove = (event: PointerEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const bounds = container.getBoundingClientRect()
      const dividerWidth = 12
      const usableWidth = Math.max(1, bounds.width - dividerWidth)
      const minLeft = Math.min(420, usableWidth * 0.45)
      const minRight = Math.min(500, usableWidth * 0.45)
      const leftWidth = Math.min(
        usableWidth - minRight,
        Math.max(minLeft, event.clientX - bounds.left),
      )
      setSplitPercent(Number(((leftWidth / usableWidth) * 100).toFixed(2)))
    }

    const handlePointerUp = () => {
      setIsResizingSplit(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingSplit])

  useEffect(() => {
    if (isResizingSplit) return
    window.localStorage.setItem(materialSplitStorageKey, String(splitPercent))
  }, [isResizingSplit, splitPercent])

  const updateVisibleFields = (next: MaterialVisibleField[]) => {
    setVisibleFields(next)
    window.localStorage.setItem('mes-lite.materials.visibleFields', JSON.stringify(next))
  }

  const updateBomSummaryFields = (next: BomSummaryField[]) => {
    setBomSummaryFields(next)
    window.localStorage.setItem(bomSummaryFieldsStorageKey, JSON.stringify(next))
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
        const customerText = summary.customersCreated ? `，新建客户 ${summary.customersCreated}` : ''
        onMessage(`导入完成：共 ${summary.total || 0} 行，新增 ${summary.created || 0}，更新 ${summary.updated || 0}，跳过 ${summary.skipped || 0}${customerText}`)
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

  const handleOpenPanorama = (material: Material) => {
    setPanoramaMaterialId(material.id)
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

  const getMaterialBomProduct = (material: Material) => bomProductByMaterialId.get(material.id) || null

  const getBomSummary = (material: Material) => {
    const product = getMaterialBomProduct(material)
    const items = product?.bom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
    const selected = new Set(bomSummaryFields)
    const itemText = (item: BomItem) => {
      const parts: string[] = []
      if (selected.has('name')) parts.push(item.material?.name || '物料')
      if (selected.has('spec') && item.material?.spec) parts.push(item.material.spec)
      if (selected.has('code')) parts.push(item.material?.code || '')
      if (selected.has('quantity')) parts.push(qty(item.quantity, 4))
      if (selected.has('unit')) parts.push(item.unit || item.material?.stockUnit || item.material?.unit || '')
      if (selected.has('wastageRate')) parts.push(`损耗 ${qty(item.wastageRate, 2)}%`)
      return parts.filter(Boolean).join(' · ')
    }
    return {
      count: items.length,
      text: items.length === 0
        ? '无 BOM'
        : items.slice(0, 2).map(itemText).join('，'),
    }
  }

  const selectMaterialForBom = (material: Material) => {
    setSelectedMaterialId(material.id)
    if (material.category === 'FINISHED') {
      setRelationProductId(`${materialProductPrefix}${material.id}`)
      return
    }
    setRelationMaterialId(material.id)
  }

  const updateDraftBomItem = (clientId: string, patch: Partial<DraftBomItem>) => {
    setDraftBomItems((current) => current.map((item) => item.clientId === clientId ? { ...item, ...patch } : item))
  }

  const saveBomForProduct = async (
    productId: string,
    items: DraftBomItem[],
    successMessage = 'BOM 关系已保存',
    outputQuantity = 1,
  ) => {
    setBomSaving(true)
    try {
      const res = await fetch('/api/boms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          outputQuantity,
          items: items.map((item) => ({
            materialId: item.materialId,
            quantity: Number(item.quantity || 0),
            unit: item.unit,
            wastageRate: Number(item.wastageRate || 0),
            cutLengthMm: item.cutLengthMm,
            cutTolerancePlusMm: item.cutLengthMm == null ? null : Number(item.cutTolerancePlusMm || 0),
            cutToleranceMinusMm: item.cutLengthMm == null ? null : Number(item.cutToleranceMinusMm || 0),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存 BOM 关系失败')
        return
      }
      onMessage(data.message || successMessage)
      await fetchBomData()
    } catch (err) {
      onMessage('保存 BOM 关系失败')
    } finally {
      setBomSaving(false)
    }
  }

  const saveSelectedBom = async () => {
    if (!selectedMaterial) return onMessage('请选择物料')
    await saveBomForProduct(
      selectedBomProduct?.id || `${materialProductPrefix}${selectedMaterial.id}`,
      draftBomItems,
      'BOM 关系已保存',
      Number(selectedBomProduct?.bom?.outputQuantity || 1),
    )
  }

  const applyRelationBom = async () => {
    if (!relationProduct) return onMessage('请选择成品物料')
    if (!relationMaterial) return onMessage('请选择原料物料')
    if (relationProductSourceMaterialId === relationMaterial.id) return onMessage('成品和原料不能是同一个物料')
    if (Number(relationProductQty || 0) <= 0) return onMessage('成品数量必须大于 0')
    if (Number(relationMaterialQty || 0) <= 0) return onMessage('原料数量必须大于 0')

    const nextOutputQuantity = Number(relationProductQty)
    const currentOutputQuantity = Number(relationProduct.bom?.outputQuantity || 1)
    const currentItems = (relationProduct.bom?.items || [])
      .filter((item) => item.itemType === 'MATERIAL' && item.material)
      .map((item) => ({
        clientId: item.id,
        materialId: item.material?.id || '',
        quantity: Number((Number(item.quantity || 0) / currentOutputQuantity * nextOutputQuantity).toFixed(8)),
        unit: item.unit || item.material?.stockUnit || item.material?.unit || '件',
        wastageRate: Number(item.wastageRate || 0),
        cutLengthMm: item.cutLengthMm == null ? null : Number(item.cutLengthMm),
        cutTolerancePlusMm: item.cutTolerancePlusMm == null ? null : Number(item.cutTolerancePlusMm),
        cutToleranceMinusMm: item.cutToleranceMinusMm == null ? null : Number(item.cutToleranceMinusMm),
      }))
    const existing = currentItems.find((item) => item.materialId === relationMaterial.id)
    const nextItems = existing
      ? currentItems.map((item) => item.materialId === relationMaterial.id ? {
          ...item,
          quantity: Number(relationMaterialQty),
          unit: relationMaterial.stockUnit || relationMaterial.unit || item.unit || '件',
          wastageRate: Number(relationWastageRate || 0),
        } : item)
      : [
          ...currentItems,
          {
            clientId: `relation-${relationMaterial.id}-${Date.now()}`,
            materialId: relationMaterial.id,
            quantity: Number(relationMaterialQty),
            unit: relationMaterial.stockUnit || relationMaterial.unit || '件',
            wastageRate: Number(relationWastageRate || 0),
            cutLengthMm: null,
            cutTolerancePlusMm: null,
            cutToleranceMinusMm: null,
          },
        ]

    await saveBomForProduct(relationProduct.id, nextItems, 'BOM 比例已写入', nextOutputQuantity)
  }

  const editInputBasisUsage = (product: MaterialBom, item: BomItem) => {
    setRelationProductId(product.id)
    setRelationMaterialId(item.material?.id || '')
    setRelationProductQty(Number(product.bom?.outputQuantity || 1))
    setRelationMaterialQty(Number(item.quantity || 0))
    setRelationWastageRate(Number(item.wastageRate || 0))
  }

  const editOutputBasisUsage = (item: DraftBomItem) => {
    setRelationProductId(selectedBomProduct?.id || (selectedMaterial ? `${materialProductPrefix}${selectedMaterial.id}` : ''))
    setRelationMaterialId(item.materialId)
    setRelationProductQty(Number(selectedBomProduct?.bom?.outputQuantity || 1))
    setRelationMaterialQty(Number(item.quantity || 0))
    setRelationWastageRate(Number(item.wastageRate || 0))
  }

  const handleHeaderSort = (field: MaterialSortBy) => {
    if (sortBy === field) {
      setSortDir((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (selectedCategories.length !== materialCategoryFilterOptions.length) {
      labels.push(selectedCategories.length === 0 ? '无分类' : `${selectedCategories.length} 类`)
    }
    if (customerFilter) {
      labels.push(customerFilter === '__UNASSIGNED__' ? '通用/未绑定' : customers.find((customer) => customer.id === customerFilter)?.name || '指定客户')
    }
    if (sortBy !== 'createdAt' || sortDir !== 'desc') {
      labels.push(`排序 ${materialSortOptions.find((option) => option.value === sortBy)?.label || sortBy}/${sortDir === 'asc' ? '升序' : '降序'}`)
    }
    if (visibleFields.length !== defaultMaterialVisibleFields.length || visibleFields.some((field, index) => field !== defaultMaterialVisibleFields[index])) {
      labels.push('字段显示')
    }
    return labels
  }, [selectedCategories, customerFilter, customers, sortBy, sortDir, visibleFields])

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        primaryFilters={(
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索物料名称或编码"
            className="w-full min-w-[180px] max-w-[320px] flex-[1_1_240px] px-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
        )}
        filterCount={activeFilterLabels.length}
        filterSummary={activeFilterLabels.slice(0, 3).map((label) => (
          <span key={label} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{label}</span>
        ))}
        filters={(
          <>
            <StatusCheckboxFilter
              options={materialCategoryFilterOptions}
              value={selectedCategories}
              onChange={setSelectedCategories}
              allLabel="全部分类"
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
            {showBomWorkspace && (
              <BomSummaryVisibilityControl
                value={bomSummaryFields}
                onChange={updateBomSummaryFields}
              />
            )}
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
  }, [onToolbarChange, selectedCategories, keyword, customerFilter, customers, sortBy, sortDir, viewMode, setViewMode, visibleFields, bomSummaryFields, activeFilterLabels, showBomWorkspace])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索物料名称或编码"
              className="w-full min-w-[180px] max-w-[320px] flex-[1_1_240px] px-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
          )}
          filterCount={activeFilterLabels.length}
          filterSummary={activeFilterLabels.slice(0, 3).map((label) => (
            <span key={label} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{label}</span>
          ))}
          filters={(
            <>
              <StatusCheckboxFilter
                options={materialCategoryFilterOptions}
                value={selectedCategories}
                onChange={setSelectedCategories}
                allLabel="全部分类"
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
              {showBomWorkspace && (
                <BomSummaryVisibilityControl
                  value={bomSummaryFields}
                  onChange={updateBomSummaryFields}
                />
              )}
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
      <div
        ref={showBomWorkspace ? splitContainerRef : undefined}
        style={showBomWorkspace ? {
          '--material-left': `${splitPercent}fr`,
          '--material-right': `${100 - splitPercent}fr`,
        } as CSSProperties : undefined}
        className={showBomWorkspace
          ? 'grid grid-cols-1 items-start gap-4 xl:items-stretch xl:gap-0 xl:[grid-template-columns:minmax(0,var(--material-left))_12px_minmax(0,var(--material-right))]'
          : 'min-w-0'}
      >
        <div className="min-w-0 rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-4 sm:shadow">
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
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] items-start gap-3">
              {materials.map((material) => {
                const bomSummary = showBomWorkspace ? getBomSummary(material) : null
                const isSelected = showBomWorkspace && material.id === selectedMaterialId
                return (
                <div
                  key={material.id}
                  onClick={() => {
                    if (showBomWorkspace) selectMaterialForBom(material)
                  }}
                  className={`group flex min-h-[218px] flex-col rounded-lg border bg-white p-3 shadow-sm transition sm:shadow-none ${showBomWorkspace ? 'cursor-pointer' : ''} ${isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'}`}
                >
                <div className="flex min-w-0 gap-3">
                  {showField('image') && (
                    <button
                      onClick={() => handleViewDetail(material)}
                      className="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
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
                    <div className="flex min-w-0 items-center gap-2">
                      {showField('code') && <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-blue-700" title={material.code}>{material.code}</span>}
                      {showField('category') && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</span>}
                    </div>
                    <div className="mt-1 line-clamp-1 text-sm font-semibold text-gray-900" title={material.name}>{material.name}</div>
                    {showField('spec') && <div className="mt-0.5 truncate text-sm text-gray-500">{material.spec || '无规格'}</div>}
                    {showField('note') && material.note && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">备注：{material.note}</div>}
                    {showField('customer') && <div className="mt-0.5 truncate text-xs text-gray-500">客户：{material.customer?.name || '通用/未绑定'}</div>}
                  </div>
                </div>
                {(showField('stock') || showField('valuationStock')) && (
                  <div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-gray-100 pt-2 text-sm">
                    {showField('stock') && (
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">库存</div>
                        <div className="mt-0.5 truncate font-semibold text-gray-900">{material.stock?.qty || 0} {material.stockUnit || material.unit}</div>
                      </div>
                    )}
                    {showField('valuationStock') && (
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">核算库存</div>
                        <div className="mt-0.5 truncate font-semibold text-emerald-700">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</div>
                      </div>
                    )}
                  </div>
                )}
                {(showField('valuationUnit') || showField('createdAt')) && (
                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-gray-500">
                    {showField('valuationUnit') && <span className="min-w-0 flex-1 truncate">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</span>}
                    {showField('valuationUnit') && <span className="whitespace-nowrap">{material.costingMethod === 'FIFO' ? 'FIFO' : '移动加权'}</span>}
                    {showField('createdAt') && <span className="whitespace-nowrap">{new Date(material.createdAt).toLocaleDateString('zh-CN')}</span>}
                  </div>
                )}
                {bomSummary && (
                  <div className={`mt-2 rounded border-l-2 px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">BOM</span>
                      <span>{bomSummary.count} 项</span>
                    </div>
                    <div className="mt-0.5 truncate" title={bomSummary.text}>{bomSummary.text}</div>
                  </div>
                )}
                <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
                  <button
                    onClick={() => handleOpenPanorama(material)}
                    className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 transition hover:bg-blue-50"
                  >
                    全景
                  </button>
                  <button
                    onClick={() => handleViewDetail(material)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                  >
                    详情
                  </button>
                  <button
                    onClick={() => handleArchive(material.id)}
                    className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 transition hover:bg-amber-50"
                  >
                    归档
                  </button>
                </div>
                </div>
                )
              })}
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
                  {showField('code') && <MaterialSortableHeader field="code" label="物料编码" sortBy={sortBy} sortDir={sortDir} className="w-36" onSort={handleHeaderSort} />}
                  <MaterialSortableHeader field="name" label="物料名称" sortBy={sortBy} sortDir={sortDir} className="w-36" onSort={handleHeaderSort} />
                  {showField('category') && <MaterialSortableHeader field="category" label="分类" sortBy={sortBy} sortDir={sortDir} className="w-24" onSort={handleHeaderSort} />}
                  {showField('customer') && <MaterialSortableHeader field="customer" label="归属客户" sortBy={sortBy} sortDir={sortDir} className="w-44" onSort={handleHeaderSort} />}
                  {showField('spec') && <MaterialSortableHeader field="spec" label="规格" sortBy={sortBy} sortDir={sortDir} className="w-32" onSort={handleHeaderSort} />}
                  {showField('note') && <MaterialSortableHeader field="note" label="备注" sortBy={sortBy} sortDir={sortDir} className="w-56" onSort={handleHeaderSort} />}
                  {showField('stockUnit') && <MaterialSortableHeader field="stockUnit" label="库存单位" sortBy={sortBy} sortDir={sortDir} className="w-24" onSort={handleHeaderSort} />}
                  {showField('valuationUnit') && <MaterialSortableHeader field="valuationUnit" label="核算单位" sortBy={sortBy} sortDir={sortDir} className="w-48" onSort={handleHeaderSort} />}
                  {showField('stock') && <MaterialSortableHeader field="stock" label="库存" sortBy={sortBy} sortDir={sortDir} className="w-28" onSort={handleHeaderSort} />}
                  {showField('valuationStock') && <MaterialSortableHeader field="valuationStock" label="核算库存" sortBy={sortBy} sortDir={sortDir} className="w-28" onSort={handleHeaderSort} />}
                  {showField('createdAt') && <MaterialSortableHeader field="createdAt" label="创建时间" sortBy={sortBy} sortDir={sortDir} className="w-32" onSort={handleHeaderSort} />}
                  {showBomWorkspace && <th className="w-56 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">BOM 简况</th>}
                  <th className="w-32 whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((material) => {
                  const bomSummary = showBomWorkspace ? getBomSummary(material) : null
                  const isSelected = showBomWorkspace && material.id === selectedMaterialId
                  return (
                  <tr
                    key={material.id}
                    onClick={() => {
                      if (showBomWorkspace) selectMaterialForBom(material)
                    }}
                    className={`align-top transition ${showBomWorkspace ? 'cursor-pointer' : ''} ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
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
                    {showField('customer') && <td className="px-4 py-3 text-sm">{material.customer?.name || '通用/未绑定'}</td>}
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
                    {bomSummary && (
                      <td className="px-4 py-3 text-sm">
                        <div className={`rounded-lg border px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">BOM</span>
                            <span>{bomSummary.count} 项</span>
                          </div>
                          <div className="mt-1 line-clamp-2">{bomSummary.text}</div>
                        </div>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => handleOpenPanorama(material)}
                        className="px-3 py-1 text-blue-700 border border-blue-300 rounded text-xs hover:bg-blue-50 transition"
                      >
                        全景
                      </button>
                      <button
                        onClick={() => handleViewDetail(material)}
                        className="ml-2 px-3 py-1 text-gray-700 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
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
                  )
                })}
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

        {showBomWorkspace && (
          <>
        <div
          role="separator"
          aria-label="调整物料列表与 BOM 明细宽度"
          aria-orientation="vertical"
          aria-valuemin={28}
          aria-valuemax={70}
          aria-valuenow={Math.round(splitPercent)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            setIsResizingSplit(true)
          }}
          onDoubleClick={() => setSplitPercent(46)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            setSplitPercent((current) => Math.min(70, Math.max(28, current + (event.key === 'ArrowRight' ? 2 : -2))))
          }}
          className={`group hidden h-full min-h-0 cursor-col-resize touch-none items-start justify-center xl:flex ${isResizingSplit ? 'bg-blue-50' : ''}`}
          title="拖动调整宽度，双击恢复默认"
        >
          <div className={`sticky top-28 mt-4 flex h-24 w-1 items-center justify-center rounded-full transition ${isResizingSplit ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-blue-400'}`}>
            <span className="h-4 w-px bg-white/80" />
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-white p-4 shadow">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">BOM 工作区</h3>
                {bomLoading && <span className="text-xs text-gray-500">同步中...</span>}
              </div>
              <div className="mt-1 truncate text-sm text-gray-500">
                {selectedMaterial ? `${selectedMaterial.code} · ${selectedMaterial.name}` : '请选择左侧物料'}
              </div>
            </div>
            <button
              type="button"
              onClick={saveSelectedBom}
              disabled={!selectedMaterial || bomSaving}
              className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bomSaving ? '保存中...' : '保存明细'}
            </button>
          </div>

          {selectedMaterial ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-gray-600">成品</label>
                      <span className="text-xs text-gray-400">产出</span>
                    </div>
                    <BomProductSearch
                      value={relationProductId}
                      products={bomProducts}
                      disabledIds={relationMaterialId ? [relationMaterialId] : []}
                      onChange={setRelationProductId}
                    />
                    <label className="mt-3 block">
                      <span className="text-xs font-medium text-gray-500">成品数量</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={relationProductQty || ''}
                        onChange={(event) => setRelationProductQty(Math.max(0, Number(event.target.value)))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm font-semibold text-gray-900"
                      />
                    </label>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-gray-600">原料</label>
                      {relationMaterial && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{relationMaterial.stockUnit || relationMaterial.unit}</span>}
                    </div>
                    <BomMaterialSelectSearch
                      value={relationMaterialId}
                      materials={bomMaterialOptions}
                      disabledIds={relationProductSourceMaterialId ? [relationProductSourceMaterialId] : []}
                      onChange={setRelationMaterialId}
                    />
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-500">原料数量</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={relationMaterialQty || ''}
                          onChange={(event) => setRelationMaterialQty(Math.max(0, Number(event.target.value)))}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm font-semibold text-gray-900"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-500">损耗率</span>
                        <div className="mt-1 flex overflow-hidden rounded-lg border border-gray-200">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={relationWastageRate || ''}
                            onChange={(event) => setRelationWastageRate(Math.max(0, Number(event.target.value)))}
                            className="min-w-0 flex-1 px-2 py-2 text-right text-sm outline-none"
                          />
                          <span className="flex items-center border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-500">%</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-xs text-gray-600">
                    {relationUnitQty > 0
                      ? <>{qty(relationProductQty, 6)} {relationProduct?.unit || '成品'} = {qty(relationMaterialQty, 6)} {relationMaterial?.stockUnit || relationMaterial?.unit || '原料'}，每件用量 {qty(relationUnitQty, 6)}</>
                      : '填写成品数量和原料数量后自动折算每件用量'}
                  </div>
                  <button
                    type="button"
                    onClick={applyRelationBom}
                    disabled={bomSaving || !relationProductId || !relationMaterialId}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bomSaving ? '写入中...' : '写入 BOM'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                <span className="text-gray-500">分类 <strong className="ml-1 font-medium text-gray-900">{materialCategoryLabels[selectedMaterial.category || 'RAW'] || '其他'}</strong></span>
                <span className="text-gray-500">BOM <strong className="ml-1 font-semibold text-blue-700">{draftBomItems.length} 项</strong></span>
                <span className="text-gray-500">被引用 <strong className="ml-1 font-semibold text-blue-700">{selectedMaterialUsageRows.length} 个产品</strong></span>
                <span className="text-gray-500">库存 <strong className="ml-1 font-semibold text-emerald-700">{selectedMaterial.stock?.qty || 0} {selectedMaterial.stockUnit || selectedMaterial.unit}</strong></span>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-200">
                  <div className="flex min-w-0 items-center">
                    <button
                      type="button"
                      onClick={() => setBomAuxiliaryView('components')}
                      className={`border-b-2 px-3 py-2 text-sm font-medium transition ${bomAuxiliaryView === 'components' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                      组成明细 {draftBomItems.length}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBomAuxiliaryView('usage')}
                      className={`border-b-2 px-3 py-2 text-sm font-medium transition ${bomAuxiliaryView === 'usage' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                      被引用 {selectedMaterialUsageRows.length}
                    </button>
                  </div>
                  <span className="hidden text-xs text-gray-400 sm:inline">点击条目可载入上方比例编辑器</span>
                </div>

                {bomAuxiliaryView === 'components' ? (
                  draftBomItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">当前产品暂无 BOM 用料</div>
                  ) : (
                    <div className="space-y-2">
                      {draftBomItems.map((item) => {
                        const material = bomMaterialById.get(item.materialId)
                        const quantityWithWastage = Number(item.quantity || 0) * (1 + Number(item.wastageRate || 0) / 100)
                        return (
                          <div key={item.clientId} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <button type="button" onClick={() => editOutputBasisUsage(item)} className="min-w-0 text-left">
                                <div className="truncate text-sm font-medium text-gray-900">{material?.name || '未知物料'}</div>
                                <div className="mt-0.5 truncate font-mono text-xs text-blue-700">{material?.code || item.materialId}</div>
                              </button>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-xs text-gray-500">含损耗 {qty(quantityWithWastage, 4)} {item.unit || material?.stockUnit || material?.unit}</span>
                                <button
                                  type="button"
                                  onClick={() => setDraftBomItems((current) => current.filter((draft) => draft.clientId !== item.clientId))}
                                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
                                  移除
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
                              <label className="min-w-0">
                                <span className="text-xs text-gray-500">基准投入量</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.quantity || ''}
                                  onChange={(event) => updateDraftBomItem(item.clientId, { quantity: Math.max(0, Number(event.target.value)) })}
                                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm"
                                />
                              </label>
                              <div className="min-w-0">
                                <span className="text-xs text-gray-500">单位</span>
                                <div className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                                  {material?.stockUnit || material?.unit || item.unit}
                                </div>
                              </div>
                              <label className="min-w-0">
                                <span className="text-xs text-gray-500">损耗率 %</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.wastageRate || ''}
                                  onChange={(event) => updateDraftBomItem(item.clientId, { wastageRate: Math.max(0, Number(event.target.value)) })}
                                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm"
                                />
                              </label>
                              <label className="min-w-0">
                                <span className="text-xs text-gray-500">成品切长 mm</span>
                                <input
                                  type="number"
                                  min="0.1"
                                  step="0.1"
                                  value={item.cutLengthMm ?? ''}
                                  placeholder="不切割"
                                  onChange={(event) => updateDraftBomItem(item.clientId, {
                                    cutLengthMm: event.target.value === '' ? null : Math.max(0.1, Number(event.target.value)),
                                  })}
                                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm"
                                />
                              </label>
                              <label className="min-w-0">
                                <span className="text-xs text-gray-500">上公差 mm</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  disabled={item.cutLengthMm == null}
                                  value={item.cutTolerancePlusMm ?? ''}
                                  onChange={(event) => updateDraftBomItem(item.clientId, {
                                    cutTolerancePlusMm: event.target.value === '' ? null : Math.max(0, Number(event.target.value)),
                                  })}
                                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm disabled:bg-gray-50"
                                />
                              </label>
                              <label className="min-w-0">
                                <span className="text-xs text-gray-500">下公差 mm</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  disabled={item.cutLengthMm == null}
                                  value={item.cutToleranceMinusMm ?? ''}
                                  onChange={(event) => updateDraftBomItem(item.clientId, {
                                    cutToleranceMinusMm: event.target.value === '' ? null : Math.max(0, Number(event.target.value)),
                                  })}
                                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm disabled:bg-gray-50"
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : selectedMaterialUsageRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">暂无关联产品 BOM</div>
                ) : (
                  <div className="space-y-2">
                    {selectedMaterialUsageRows.map(({ product, item }) => (
                      <button
                        type="button"
                        key={`${product.id}-${item.id}`}
                        onClick={() => editInputBasisUsage(product, item)}
                        className="grid w-full grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{product.name}</span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-blue-700">{product.sku}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 sm:justify-end">
                          <span>每件 <strong className="font-semibold text-gray-900">{qty(item.quantity, 6)} {item.unit}</strong></span>
                          <span>损耗 <strong className="font-semibold text-gray-900">{qty(item.wastageRate, 3)}%</strong></span>
                          <span>含损耗 <strong className="font-semibold text-gray-900">{qty(Number(item.quantity || 0) * (1 + Number(item.wastageRate || 0) / 100), 6)} {item.unit}</strong></span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">左侧选择一个物料后查看 BOM</div>
          )}
        </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
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
                          <option key={customer.id} value={customer.id}>{customer.name}</option>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b">
              <h3 className="text-base font-semibold text-gray-900">物料详情</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOpenPanorama(detailMaterial)}
                  className="px-3 py-2 text-sm text-green-700 border border-green-300 rounded-md hover:bg-green-50"
                >
                  全景
                </button>
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
                    <p className="mt-1 text-sm text-gray-600">归属客户：{detailMaterial.customer?.name || '通用/未绑定'}</p>
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

      {panoramaMaterialId && (
        <MaterialPanoramaPage
          materialId={panoramaMaterialId}
          onClose={() => setPanoramaMaterialId(null)}
          onMessage={onMessage}
        />
      )}
    </>
  )
}
