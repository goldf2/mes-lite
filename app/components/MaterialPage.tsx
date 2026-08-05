'use client'

import { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useState, useEffect, useMemo, useRef } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import MaterialPanoramaPage from './MaterialPanoramaPage'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import { bomRatiosDiffer } from '@/lib/bom-ratio'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import {
  bomEntryUnitOptions,
  bomStoredQuantityToEntry,
  convertBomEntryQuantity,
  defaultBomEntryUnit,
  normalizeBomEntryQuantity,
} from '@/lib/bom-entry-units'
import { normalizeUnitCode } from '@/lib/unit-catalog'
import { useBomPagePreferences } from './bomPagePreferences'
import AppLoadingIndicator from './AppLoadingIndicator'

interface Material {
  id: string
  code: string
  name: string
  spec: string
  note?: string | null
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  primaryMeasure: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'
  referenceMeasure?: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER' | null
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
  primaryMeasure?: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'
  stockQty?: number
  primaryImage?: { id: string; url: string; note?: string | null; mimeType: string; isCover: boolean } | null
}

interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  entryUnit?: string | null
  wastageRate: number
  material?: BomMaterialOption | null
  outputMaterialId?: string | null
  outputMaterial?: BomMaterialOption | null
}

interface BomVersion {
  id: string
  name: string
  purpose: 'PRODUCTION' | 'PACKAGING'
  version: string
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  outputs: BomOutput[]
  items: BomItem[]
}

interface BomOutput {
  id: string
  quantity: number
  unit: string
  entryUnit?: string | null
  isPrimary: boolean
  material: BomMaterialOption
}

interface MaterialBom {
  id: string
  sku: string
  name: string
  description?: string | null
  category: string
  unit: string
  sourceMaterialId?: string
  bom?: BomVersion | null
  boms: BomVersion[]
}

interface DraftBomItem {
  clientId: string
  materialId: string
  quantity: number | string
  unit: string
  wastageRate: number
}

interface DraftBomOutput {
  clientId: string
  materialId: string
  quantity: number | string
  unit: string
}

interface Customer {
  id: string
  code: string
  name: string
}

interface ConfiguredUnit {
  code: string
  name: string
  measureType: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'
  toBaseFactor: number
  isBase: boolean
  isPreset: boolean
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
const bomStatusOptions = [
  { value: 'all', label: '全部 BOM 状态' },
  { value: 'NONE', label: '未建立产出 BOM' },
  { value: 'NO_ACTIVE', label: '有 BOM 但无启用方案' },
  { value: 'NO_DEFAULT', label: '有启用方案但无默认方案' },
  { value: 'READY', label: '已有可用默认 BOM' },
] as const
type BomStatusFilter = (typeof bomStatusOptions)[number]['value']
const primaryMeasureOptions = [
  ['LENGTH', '长度'],
  ['WEIGHT', '重量'],
  ['QUANTITY', '数量'],
  ['OTHER', '其他'],
] as const
const primaryMeasureLabels = Object.fromEntries(primaryMeasureOptions) as Record<string, string>
const materialProductPrefix = 'material:'
const bomWorkspaceStateStorageKey = 'mes-lite.boms.workspaceState'
const bomSummaryVisibleStorageKey = 'mes-lite.materials.bomSummaryVisible'
const bomSummaryFieldsStorageKey = 'mes-lite.materials.bomSummaryFields'
const materialColumnWidthsStorageKey = 'mes-lite.materials.columnWidths'
const materialSortOptions = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'code', label: '物料编码' },
  { value: 'name', label: '物料名称' },
  { value: 'category', label: '物料分类' },
  { value: 'customer', label: '归属客户' },
  { value: 'spec', label: '规格' },
  { value: 'note', label: '备注' },
  { value: 'stockUnit', label: '库存单位' },
  { value: 'valuationUnit', label: '参考/计价单位' },
  { value: 'costingMethod', label: '成本方法' },
  { value: 'stock', label: '库存数量' },
  { value: 'valuationStock', label: '参考数量' },
  { value: 'bomSummary', label: 'BOM 简况' },
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
  { key: 'valuationUnit', label: '参考/计价单位' },
  { key: 'stock', label: '库存' },
  { key: 'valuationStock', label: '参考数量' },
  { key: 'createdAt', label: '创建时间' },
] as const

type MaterialVisibleField = (typeof materialVisibleFieldOptions)[number]['key']
type MaterialTableColumnKey = MaterialVisibleField | 'name' | 'bomSummary' | 'actions'
type MaterialColumnWidths = Partial<Record<MaterialTableColumnKey, number>>

const materialColumnMinWidths: Record<MaterialTableColumnKey, number> = {
  image: 72,
  code: 112,
  name: 112,
  category: 80,
  customer: 112,
  spec: 96,
  note: 144,
  stockUnit: 88,
  valuationUnit: 160,
  stock: 96,
  valuationStock: 96,
  createdAt: 128,
  bomSummary: 176,
  actions: 232,
}

const bomSummaryFieldOptions = [
  { key: 'name', label: '物料名称' },
  { key: 'spec', label: '规格' },
  { key: 'code', label: '编码' },
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
    primaryMeasure: 'QUANTITY',
    referenceMeasure: 'WEIGHT',
    unit: '件',
    stockUnit: '件',
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
  visible,
  value,
  onVisibleChange,
  onChange,
}: {
  visible: boolean
  value: BomSummaryField[]
  onVisibleChange: (visible: boolean) => void
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
        className={`h-9 whitespace-nowrap rounded-lg border bg-white px-3 text-sm hover:bg-gray-50 ${visible ? 'border-gray-200 text-gray-700' : 'border-blue-300 text-blue-700'}`}
      >
        {visible ? 'BOM 简况配置' : 'BOM 简况已隐藏'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => onVisibleChange(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            显示 BOM 简况
          </label>
          {visible && (
            <>
              <div className="mx-2 my-1 border-t border-gray-100" />
              <div className="px-2 py-2 text-xs text-gray-500">选择简况中显示的内容</div>
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
            </>
          )}
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

function ColumnResizeHandle({
  label,
  onPointerDown,
  onReset,
  onNudge,
}: {
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onReset: () => void
  onNudge: (delta: number) => void
}) {
  return (
    <span
      role="separator"
      aria-label={`调整${label}列宽`}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        onNudge(event.key === 'ArrowRight' ? 12 : -12)
      }}
      title="拖动调整列宽，双击恢复自动列宽"
      className="absolute -right-1 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none before:h-5 before:w-px before:bg-gray-300 hover:before:bg-blue-500 focus:before:bg-blue-500"
    />
  )
}

function MaterialTableHeader({
  columnKey,
  label,
  className,
  style,
  onResize,
  onReset,
  onNudge,
}: {
  columnKey: MaterialTableColumnKey
  label: string
  className?: string
  style?: CSSProperties
  onResize: (column: MaterialTableColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => void
  onReset: (column: MaterialTableColumnKey) => void
  onNudge: (column: MaterialTableColumnKey, delta: number) => void
}) {
  return (
    <th
      scope="col"
      style={style}
      className={`relative whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600 ${className || ''}`}
    >
      {label}
      <ColumnResizeHandle
        label={label}
        onPointerDown={(event) => onResize(columnKey, event)}
        onReset={() => onReset(columnKey)}
        onNudge={(delta) => onNudge(columnKey, delta)}
      />
    </th>
  )
}

function MaterialSortableHeader({
  columnKey,
  field,
  label,
  sortBy,
  sortDir,
  className,
  style,
  onSort,
  onResize,
  onReset,
  onNudge,
}: {
  columnKey: MaterialTableColumnKey
  field: MaterialSortBy
  label: string
  sortBy: MaterialSortBy
  sortDir: SortDirection
  className: string
  style?: CSSProperties
  onSort: (field: MaterialSortBy) => void
  onResize: (column: MaterialTableColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => void
  onReset: (column: MaterialTableColumnKey) => void
  onNudge: (column: MaterialTableColumnKey, delta: number) => void
}) {
  const active = sortBy === field

  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={style}
      className={`${className} relative whitespace-nowrap px-4 py-3 text-left text-sm font-semibold`}
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
      <ColumnResizeHandle
        label={label}
        onPointerDown={(event) => onResize(columnKey, event)}
        onReset={() => onReset(columnKey)}
        onNudge={(delta) => onNudge(columnKey, delta)}
      />
    </th>
  )
}

function qty(value: number, digits = 6) {
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

function BomQuantityEditor({
  label,
  value,
  unit,
  material,
  unitCatalog,
  onValueChange,
  onUnitChange,
}: {
  label: string
  value: number | string
  unit: string
  material: BomMaterialOption
  unitCatalog: ConfiguredUnit[]
  onValueChange: (value: string) => void
  onUnitChange: (unit: string) => void
}) {
  const unitOptions = bomEntryUnitOptions(unitCatalog, material)

  return (
    <label className="flex w-full min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
      <input
        aria-label={label}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="min-w-[5.5rem] flex-1 px-3 py-2 text-right text-sm outline-none"
      />
      {unitOptions.length > 0 ? (
        <select
          aria-label={`${label}单位`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value)}
          className="min-w-[4.5rem] max-w-24 border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 outline-none"
        >
          {unitOptions.map((option) => (
            <option key={`${option.measureType}:${option.code}`} value={option.code}>{option.code}</option>
          ))}
        </select>
      ) : (
        <span className="flex min-w-10 items-center justify-center border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-600">
          {unit || material.stockUnit || material.unit}
        </span>
      )}
    </label>
  )
}

function BomMaterialIdentity({
  material,
  fallbackId,
  badge,
  onPreview,
}: {
  material?: BomMaterialOption
  fallbackId: string
  badge?: ReactNode
  onPreview: (material: BomMaterialOption) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {material?.primaryImage ? (
        <button
          type="button"
          onClick={() => onPreview(material)}
          title="放大查看物料图片"
          aria-label={`放大查看${material.name}图片`}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <img
            src={material.primaryImage.url}
            alt={material.primaryImage.note || material.name}
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400">
          无图
        </div>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{material?.name || '未知物料'}</span>
          {badge}
        </div>
        <div className="truncate text-xs text-gray-500">{material?.code || fallbackId}{material?.spec ? ` · ${material.spec}` : ''}</div>
      </div>
    </div>
  )
}

export default function MaterialPage({
  onMessage,
  onToolbarChange,
  showBomWorkspace = false,
  openBomRequest,
  onOpenBomRequestHandled,
  onOpenBomWorkspace,
  canReadBom = false,
  canCreateBom = false,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  showBomWorkspace?: boolean
  openBomRequest?: { materialId: string; bomId?: string; requestId: number } | null
  onOpenBomRequestHandled?: () => void
  onOpenBomWorkspace?: (materialId: string) => void
  canReadBom?: boolean
  canCreateBom?: boolean
}) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bomProducts, setBomProducts] = useState<MaterialBom[]>([])
  const [bomMaterialOptions, setBomMaterialOptions] = useState<BomMaterialOption[]>([])
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedBomId, setSelectedBomId] = useState('')
  const [draftBomName, setDraftBomName] = useState('')
  const [draftBomPurpose, setDraftBomPurpose] = useState<'PRODUCTION' | 'PACKAGING'>('PRODUCTION')
  const [draftBomOutputQuantity, setDraftBomOutputQuantity] = useState('1')
  const [draftBomOutputUnit, setDraftBomOutputUnit] = useState('件')
  const [draftBomOutputs, setDraftBomOutputs] = useState<DraftBomOutput[]>([])
  const [draftBomIsDefault, setDraftBomIsDefault] = useState(true)
  const [draftBomItems, setDraftBomItems] = useState<DraftBomItem[]>([])
  const [unitCatalog, setUnitCatalog] = useState<ConfiguredUnit[]>([])
  const [bomPagePreferences] = useBomPagePreferences()
  const [previewBomMaterial, setPreviewBomMaterial] = useState<BomMaterialOption | null>(null)
  const [bomLoading, setBomLoading] = useState(false)
  const [bomDataReady, setBomDataReady] = useState(false)
  const [bomSaving, setBomSaving] = useState(false)
  const [quickBomMaterialId, setQuickBomMaterialId] = useState<string | null>(null)
  const [quickBomDraftReady, setQuickBomDraftReady] = useState(false)
  const [bomKeyword, setBomKeyword] = useState('')
  const [keyword, setKeyword] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [bomStatusFilter, setBomStatusFilter] = useState<BomStatusFilter>('all')
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
  const [bomSummaryVisible, setBomSummaryVisible] = useState(true)
  const [bomSummaryFields, setBomSummaryFields] = useState<BomSummaryField[]>(defaultBomSummaryFields)
  const [columnWidths, setColumnWidths] = useState<MaterialColumnWidths>({})
  const columnResizeCleanupRef = useRef<(() => void) | null>(null)
  const loadedBomDraftSignatureRef = useRef('')
  const bomWorkspaceStateRestoredRef = useRef(false)
  const handledBomOpenRequestRef = useRef<number | null>(null)
  const [form, setForm] = useState(createEmptyMaterialForm())
  const formStockUnitOptions = unitCatalog.filter((unit) => unit.measureType === form.primaryMeasure)
  const formValuationUnitOptions = unitCatalog.filter((unit) => unit.measureType === form.referenceMeasure)
  const formStockUnitConfigured = formStockUnitOptions.some((unit) => unit.code === form.stockUnit)
  const formValuationUnitConfigured = formValuationUnitOptions.some((unit) => unit.code === form.valuationUnit)
  const showField = (field: MaterialVisibleField) => visibleFields.includes(field)
  const canUseBomData = showBomWorkspace || canReadBom
  const [loading, setLoading] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip')
  const [importLoading, setImportLoading] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const bomOutputMaterialOptions = useMemo(() => bomMaterialOptions.map((material) => ({
    value: material.id,
    label: materialOptionLabel(material),
    keywords: `${material.code} ${material.name} ${material.spec || ''} ${materialCategoryLabels[material.category] || material.category}`,
  })), [bomMaterialOptions])
  const selectedMaterial = showBomWorkspace
    ? bomMaterialOptions.find((material) => material.id === selectedMaterialId) || null
    : materials.find((material) => material.id === selectedMaterialId) || null
  const bomProductByMaterialId = useMemo(() => new Map(bomProducts.map((product) => [product.sourceMaterialId || product.id.replace(materialProductPrefix, ''), product])), [bomProducts])
  const bomMaterialById = useMemo(() => new Map(bomMaterialOptions.map((material) => [material.id, material])), [bomMaterialOptions])
  const preferredBomEntryUnit = useCallback((material: BomMaterialOption) => {
    const preferredCode = material.primaryMeasure === 'LENGTH'
      ? bomPagePreferences.lengthUnit
      : material.primaryMeasure === 'WEIGHT'
        ? bomPagePreferences.weightUnit
        : undefined
    return defaultBomEntryUnit(unitCatalog, material, preferredCode)
  }, [bomPagePreferences.lengthUnit, bomPagePreferences.weightUnit, unitCatalog])
  const existingBomRows = useMemo(() => {
    const normalizedKeyword = bomKeyword.trim().toLocaleLowerCase()
    return bomProducts.flatMap((product) => product.boms.map((bom) => {
      const materialId = product.sourceMaterialId || product.id.replace(materialProductPrefix, '')
      return {
        product,
        bom,
        materialId,
        material: bomMaterialById.get(materialId) || null,
      }
    })).filter(({ product, bom, material }) => {
      if (!normalizedKeyword) return true
      return [
        product.sku,
        product.name,
        product.description,
        bom.name,
        bom.version,
        material?.code,
        material?.name,
        material?.spec,
        ...bom.outputs.flatMap((output) => [output.material.code, output.material.name, output.material.spec]),
        ...bom.items.flatMap((item) => [item.material?.code, item.material?.name, item.material?.spec]),
      ].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedKeyword)
    })
  }, [bomKeyword, bomMaterialById, bomProducts])
  const selectedBomProduct = selectedMaterial ? bomProductByMaterialId.get(selectedMaterial.id) || null : null
  const selectedBom = selectedBomId === '__new__'
    ? null
    : selectedBomProduct?.boms.find((bom) => bom.id === selectedBomId) || selectedBomProduct?.bom || null
  const selectedBomOutputQuantity = Number(draftBomOutputQuantity)
  const selectedBomPrimaryOutput = selectedBom?.outputs.find((output) => output.isPrimary) || null
  const selectedBomMaterialItems = useMemo(() => (
    selectedBom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
  ), [selectedBom])
  const selectedBomBatchItems = useMemo(() => {
    const byMaterial = new Map<string, BomItem>()
    selectedBomMaterialItems.forEach((item) => {
      const materialId = item.material?.id
      if (!materialId) return
      const existing = byMaterial.get(materialId)
      byMaterial.set(materialId, existing
        ? { ...existing, quantity: Number(existing.quantity) + Number(item.quantity) }
        : item)
    })
    return Array.from(byMaterial.values())
  }, [selectedBomMaterialItems])
  const savedBomItemByMaterialId = useMemo(() => new Map(
    selectedBomBatchItems.map((item) => [item.material?.id || '', item]),
  ), [selectedBomBatchItems])
  const selectedBomAdditionalOutputs = useMemo(() => (
    selectedBom?.outputs.filter((output) => !output.isPrimary) || []
  ), [selectedBom])
  const savedBomOutputByMaterialId = useMemo(() => new Map(
    selectedBomAdditionalOutputs.map((output) => [output.material.id, output]),
  ), [selectedBomAdditionalOutputs])
  const draftQuantityInStockUnit = (quantity: number | string, entryUnit: string, material?: BomMaterialOption | Material | null) => {
    if (!material) return Number.NaN
    try {
      return normalizeBomEntryQuantity({
        quantity: Number(quantity),
        entryUnit,
        material,
        catalog: unitCatalog,
      }).quantity
    } catch {
      return Number.NaN
    }
  }
  const draftBomDirty = draftBomItems.length !== selectedBomBatchItems.length
    || draftBomItems.some((item) => {
      const savedItem = savedBomItemByMaterialId.get(item.materialId)
      const material = bomMaterialById.get(item.materialId)
      return !savedItem
        || bomRatiosDiffer(Number(savedItem.quantity), draftQuantityInStockUnit(item.quantity, item.unit, material))
        || normalizeUnitCode(savedItem.entryUnit || savedItem.unit) !== normalizeUnitCode(item.unit)
    })
    || draftBomOutputs.length !== selectedBomAdditionalOutputs.length
    || draftBomOutputs.some((output) => {
      const savedOutput = savedBomOutputByMaterialId.get(output.materialId)
      const material = bomMaterialById.get(output.materialId)
      return !savedOutput
        || bomRatiosDiffer(Number(savedOutput.quantity), draftQuantityInStockUnit(output.quantity, output.unit, material))
        || normalizeUnitCode(savedOutput.entryUnit || savedOutput.unit) !== normalizeUnitCode(output.unit)
    })
    || selectedBomId === '__new__'
    || draftBomName !== (selectedBom?.name || '')
    || draftBomPurpose !== (selectedBom?.purpose || 'PRODUCTION')
    || draftBomIsDefault !== (selectedBom?.isDefault ?? true)
    || bomRatiosDiffer(
      draftQuantityInStockUnit(selectedBomOutputQuantity, draftBomOutputUnit, selectedMaterial),
      Number(selectedBom?.outputQuantity || 1),
    )
    || normalizeUnitCode(selectedBomPrimaryOutput?.entryUnit || selectedBomPrimaryOutput?.unit || selectedBom?.outputUnit || '') !== normalizeUnitCode(draftBomOutputUnit)
  const fetchBomData = useCallback(async (preferredBomId?: string) => {
    setBomLoading(true)
    setBomDataReady(false)
    try {
      const res = await fetch('/api/boms')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 关系失败')
        return
      }
      const nextProducts = data.products || []
      setBomProducts(nextProducts)
      setBomMaterialOptions(data.materialOptions || [])
      if (preferredBomId) {
        const targetProduct = nextProducts.find((product: MaterialBom) => product.boms.some((bom) => bom.id === preferredBomId))
        if (targetProduct) {
          loadedBomDraftSignatureRef.current = ''
          setSelectedMaterialId(targetProduct.sourceMaterialId || targetProduct.id.replace(materialProductPrefix, ''))
          setSelectedBomId(preferredBomId)
        }
      }
    } catch (err) {
      onMessage('获取 BOM 关系失败')
    } finally {
      setBomLoading(false)
      setBomDataReady(true)
    }
  }, [onMessage])

  useEffect(() => {
    if (!showBomWorkspace) fetchMaterials()
  }, [keyword, selectedCategories, customerFilter, bomStatusFilter, sortBy, sortDir, page, pageSize, showBomWorkspace])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategories, customerFilter, bomStatusFilter, sortBy, sortDir, pageSize])

  useEffect(() => {
    fetchCustomers()
    fetchUnitCatalog()
    if (canUseBomData && (showBomWorkspace || bomSummaryVisible)) fetchBomData()
  }, [bomSummaryVisible, canUseBomData, fetchBomData, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || bomLoading || !selectedMaterialId) return
    if (!bomMaterialOptions.some((material) => material.id === selectedMaterialId)) {
      setSelectedMaterialId('')
    }
  }, [bomLoading, bomMaterialOptions, selectedMaterialId, showBomWorkspace])

  useEffect(() => {
    if (!selectedBomProduct) {
      if (selectedBomId !== '__new__') setSelectedBomId('__new__')
      return
    }
    if (selectedBomId === '__new__') return
    if (!selectedBomProduct.boms.some((bom) => bom.id === selectedBomId)) {
      setSelectedBomId(selectedBomProduct.bom?.id || '__new__')
    }
  }, [selectedBomId, selectedBomProduct])

  useEffect(() => {
    if (showBomWorkspace && unitCatalog.length === 0) return
    const savedSignature = selectedBomId === '__new__'
      ? `new:${selectedBomProduct?.id || ''}`
      : JSON.stringify({
      bomId: selectedBom?.id || '',
      name: selectedBom?.name || '',
      purpose: selectedBom?.purpose || 'PRODUCTION',
      isDefault: selectedBom?.isDefault ?? true,
      outputQuantity: Number(selectedBom?.outputQuantity || 1),
      outputs: (selectedBom?.outputs || []).map((output) => ({
        id: output.id,
        materialId: output.material.id,
        quantity: Number(output.quantity),
        entryUnit: output.entryUnit || output.unit,
        isPrimary: output.isPrimary,
      })),
      items: selectedBomBatchItems.map((item) => ({
        id: item.id,
        materialId: item.material?.id || '',
        quantity: Number(item.quantity || 0),
        unit: item.material?.stockUnit || item.material?.unit || item.unit || '件',
        entryUnit: item.entryUnit || item.unit,
      })),
    })
    if (loadedBomDraftSignatureRef.current === savedSignature) return
    loadedBomDraftSignatureRef.current = savedSignature
    if (selectedBomId === '__new__') {
      setDraftBomName(`BOM ${(selectedBomProduct?.boms.length || 0) + 1}`)
      setDraftBomPurpose('PRODUCTION')
      setDraftBomOutputQuantity('1')
      setDraftBomOutputUnit(selectedMaterial ? preferredBomEntryUnit(selectedMaterial) : '件')
      setDraftBomOutputs([])
      setDraftBomIsDefault((selectedBomProduct?.boms.length || 0) === 0)
      setDraftBomItems([])
      return
    }
    setDraftBomName(selectedBom?.name || '默认方案')
    setDraftBomPurpose(selectedBom?.purpose || 'PRODUCTION')
    const primaryOutput = selectedBom?.outputs.find((output) => output.isPrimary)
    const primaryEntryUnit = primaryOutput?.entryUnit || primaryOutput?.unit || selectedMaterial?.stockUnit || selectedMaterial?.unit || '件'
    setDraftBomOutputUnit(primaryEntryUnit)
    setDraftBomOutputQuantity(String(bomStoredQuantityToEntry({
      quantity: Number(primaryOutput?.quantity || selectedBom?.outputQuantity || 1),
      entryUnit: primaryEntryUnit,
      material: selectedMaterial || {},
      catalog: unitCatalog,
    })))
    setDraftBomOutputs(selectedBomAdditionalOutputs.map((output) => ({
      clientId: output.id,
      materialId: output.material.id,
      quantity: bomStoredQuantityToEntry({
        quantity: Number(output.quantity),
        entryUnit: output.entryUnit || output.unit,
        material: output.material,
        catalog: unitCatalog,
      }),
      unit: output.entryUnit || output.unit || output.material.stockUnit || output.material.unit,
    })))
    setDraftBomIsDefault(selectedBom?.isDefault ?? true)
    setDraftBomItems(selectedBomBatchItems.map((item) => ({
      clientId: item.id,
      materialId: item.material?.id || '',
      quantity: bomStoredQuantityToEntry({
        quantity: Number(item.quantity || 0),
        entryUnit: item.entryUnit || item.unit,
        material: item.material || {},
        catalog: unitCatalog,
      }),
      unit: item.entryUnit || item.unit || item.material?.stockUnit || item.material?.unit || '件',
      wastageRate: 0,
    })))
  }, [preferredBomEntryUnit, selectedBom, selectedBomAdditionalOutputs, selectedBomBatchItems, selectedBomId, selectedBomProduct?.boms.length, selectedBomProduct?.id, selectedMaterial, showBomWorkspace, unitCatalog])

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
    const saved = window.localStorage.getItem(bomSummaryVisibleStorageKey)
    if (saved !== null) setBomSummaryVisible(saved !== 'false')
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
    const saved = window.localStorage.getItem(materialColumnWidthsStorageKey)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as Record<string, unknown>
      const allowed = new Set(Object.keys(materialColumnMinWidths))
      const next = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
        allowed.has(key) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= materialColumnMinWidths[key as MaterialTableColumnKey] &&
        value <= 720
      ))) as MaterialColumnWidths
      setColumnWidths(next)
    } catch (err) {
      // ignore invalid local preference
    }
  }, [])

  useEffect(() => () => columnResizeCleanupRef.current?.(), [])

  const updateVisibleFields = (next: MaterialVisibleField[]) => {
    setVisibleFields(next)
    window.localStorage.setItem('mes-lite.materials.visibleFields', JSON.stringify(next))
  }

  const updateBomSummaryFields = (next: BomSummaryField[]) => {
    setBomSummaryFields(next)
    window.localStorage.setItem(bomSummaryFieldsStorageKey, JSON.stringify(next))
  }

  const updateBomSummaryVisible = (visible: boolean) => {
    setBomSummaryVisible(visible)
    window.localStorage.setItem(bomSummaryVisibleStorageKey, String(visible))
  }

  const updateColumnWidth = useCallback((column: MaterialTableColumnKey, width: number) => {
    setColumnWidths((current) => {
      const next = {
        ...current,
        [column]: Math.min(720, Math.max(materialColumnMinWidths[column], Math.round(width))),
      }
      window.localStorage.setItem(materialColumnWidthsStorageKey, JSON.stringify(next))
      return next
    })
  }, [])

  const resetColumnWidth = useCallback((column: MaterialTableColumnKey) => {
    setColumnWidths((current) => {
      const next = { ...current }
      delete next[column]
      window.localStorage.setItem(materialColumnWidthsStorageKey, JSON.stringify(next))
      return next
    })
  }, [])

  const resetAllColumnWidths = useCallback(() => {
    columnResizeCleanupRef.current?.()
    setColumnWidths({})
    window.localStorage.removeItem(materialColumnWidthsStorageKey)
  }, [])

  const nudgeColumnWidth = useCallback((column: MaterialTableColumnKey, delta: number) => {
    updateColumnWidth(column, (columnWidths[column] || materialColumnMinWidths[column]) + delta)
  }, [columnWidths, updateColumnWidth])

  const startColumnResize = useCallback((
    column: MaterialTableColumnKey,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    columnResizeCleanupRef.current?.()
    const header = event.currentTarget.closest('th')
    if (!header) return
    const startX = event.clientX
    const startWidth = header.getBoundingClientRect().width

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      columnResizeCleanupRef.current = null
    }
    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateColumnWidth(column, startWidth + moveEvent.clientX - startX)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    columnResizeCleanupRef.current = cleanup
  }, [updateColumnWidth])

  const columnStyle = (column: MaterialTableColumnKey): CSSProperties | undefined => {
    const width = columnWidths[column]
    return width ? { width, minWidth: width, maxWidth: width } : undefined
  }

  const buildMaterialParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    if (keyword) params.set('keyword', keyword)
    if (customerFilter) params.set('customerId', customerFilter)
    if (canUseBomData && bomStatusFilter !== 'all') params.set('bomStatus', bomStatusFilter)
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

  const refreshMaterialSources = async () => {
    const tasks: Promise<unknown>[] = [fetchMaterials()]
    if (canUseBomData) tasks.push(fetchBomData())
    await Promise.allSettled(tasks)
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
        await refreshMaterialSources()
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

  const fetchUnitCatalog = async () => {
    try {
      const res = await fetch('/api/system/units')
      const data = await res.json()
      if (res.ok) setUnitCatalog(data.data || [])
    } catch {
      // 物料列表仍可读取；编辑时会保留现有旧单位。
    }
  }

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.stockUnit || (form.useDualUnit && (!form.valuationUnit || form.conversionRate <= 0))) {
      onMessage('请填写完整信息')
      return
    }
    setLoading(true)
    let succeeded = false
    try {
      const payload = {
        code: form.code,
        name: form.name,
        spec: form.spec,
        note: form.note,
        category: form.category,
        customerId: form.customerId || undefined,
        primaryMeasure: form.primaryMeasure,
        referenceMeasure: form.useDualUnit ? form.referenceMeasure : undefined,
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
          succeeded = true
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
          succeeded = true
        } else {
          onMessage(data.error || '创建失败')
        }
      }
      if (succeeded) {
        setShowModal(false)
        setForm(createEmptyMaterialForm())
        setEditingMaterial(null)
        setPage(1)
        await refreshMaterialSources()
      }
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
        await refreshMaterialSources()
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
      primaryMeasure: material.primaryMeasure || 'QUANTITY',
      referenceMeasure: material.referenceMeasure || 'WEIGHT',
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
    const componentItems = product?.bom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
    const usageItems = bomProducts.flatMap((usageProduct) => (usageProduct.bom?.items || [])
      .filter((item) => item.itemType === 'MATERIAL' && item.material?.id === material.id)
      .map((item) => ({ product: usageProduct, item })))
    const selected = new Set(bomSummaryFields)
    const componentText = (item: BomItem) => {
      const parts: string[] = []
      if (selected.has('name')) parts.push(item.material?.name || '物料')
      if (selected.has('spec') && item.material?.spec) parts.push(item.material.spec)
      if (selected.has('code')) parts.push(item.material?.code || '')
      const relation = parts.filter(Boolean).join(' · ')
      return Number(item.quantity) > 0 ? `${relation}（每批 ${qty(Number(item.quantity))} ${item.unit}）` : relation
    }
    const usageText = ({ product: usageProduct, item }: { product: MaterialBom; item: BomItem }) => {
      const parts: string[] = []
      if (selected.has('name')) parts.push(usageProduct.name)
      if (selected.has('spec') && usageProduct.description) parts.push(usageProduct.description)
      if (selected.has('code')) parts.push(usageProduct.sku)
      return parts.filter(Boolean).join(' · ')
    }
    const sections: string[] = []
    if (componentItems.length > 0) {
      sections.push(`组成：${componentItems.slice(0, 2).map(componentText).join('，')}`)
    }
    if (usageItems.length > 0) {
      sections.push(`用于：${usageItems.slice(0, 2).map(usageText).join('，')}`)
    }
    return {
      count: componentItems.length + usageItems.length,
      componentCount: componentItems.length,
      usageCount: new Set(usageItems.map(({ product: usageProduct }) => usageProduct.id)).size,
      text: sections.join('；') || '无 BOM 关联',
    }
  }

  const selectMaterialForBom = useCallback((materialId: string) => {
    const product = materialId ? bomProductByMaterialId.get(materialId) : null
    const material = bomMaterialById.get(materialId)
    loadedBomDraftSignatureRef.current = `new:${product?.id || ''}`
    setSelectedMaterialId(materialId)
    setSelectedBomId('__new__')
    setDraftBomName(`BOM ${(product?.boms.length || 0) + 1}`)
    setDraftBomOutputQuantity('1')
    setDraftBomOutputUnit(material ? preferredBomEntryUnit(material) : '件')
    setDraftBomOutputs([])
    setDraftBomIsDefault((product?.boms.length || 0) === 0)
    setDraftBomItems([])
  }, [bomMaterialById, bomProductByMaterialId, preferredBomEntryUnit])

  const selectOutputMaterialForBom = useCallback((materialId: string) => {
    const product = bomProductByMaterialId.get(materialId)
    const material = bomMaterialById.get(materialId)
    loadedBomDraftSignatureRef.current = `new:${product?.id || ''}`
    setSelectedMaterialId(materialId)
    setSelectedBomId('__new__')
    setDraftBomOutputQuantity('1')
    setDraftBomOutputUnit(material ? preferredBomEntryUnit(material) : '件')
    setDraftBomOutputs([])
    setDraftBomName((current) => current.trim() || `BOM ${(product?.boms.length || 0) + 1}`)
    setDraftBomIsDefault((product?.boms.length || 0) === 0)
  }, [bomMaterialById, bomProductByMaterialId, preferredBomEntryUnit])

  const addInputMaterialToDraft = useCallback((materialId: string) => {
    if (!materialId) return
    if (materialId === selectedMaterialId || draftBomOutputs.some((output) => output.materialId === materialId)) {
      onMessage('同一物料不能同时作为 BOM 投入和产出')
      return
    }
    if (draftBomItems.some((item) => item.materialId === materialId)) {
      onMessage('该投入物料已经添加')
      return
    }
    const material = bomMaterialById.get(materialId)
    if (!material) return
    setDraftBomItems((current) => [...current, {
      clientId: `input-${materialId}-${Date.now()}`,
      materialId,
      quantity: '1',
      unit: preferredBomEntryUnit(material),
      wastageRate: 0,
    }])
  }, [bomMaterialById, draftBomItems, draftBomOutputs, onMessage, preferredBomEntryUnit, selectedMaterialId])

  const addOutputMaterialToDraft = useCallback((materialId: string) => {
    if (!materialId) return
    if (!selectedMaterial) {
      selectOutputMaterialForBom(materialId)
      return
    }
    if (materialId === selectedMaterial.id) {
      onMessage('该物料已是主产出')
      return
    }
    if (draftBomItems.some((item) => item.materialId === materialId)) {
      onMessage('同一物料不能同时作为 BOM 投入和产出')
      return
    }
    const material = bomMaterialById.get(materialId)
    if (!material) return
    setDraftBomOutputs((current) => current.some((output) => output.materialId === materialId)
      ? current
      : [...current, {
          clientId: `output-${materialId}-${Date.now()}`,
          materialId,
          quantity: '1',
          unit: preferredBomEntryUnit(material),
        }])
  }, [bomMaterialById, draftBomItems, onMessage, preferredBomEntryUnit, selectOutputMaterialForBom, selectedMaterial])

  const removePrimaryOutput = useCallback(() => {
    const [replacement, ...remainingOutputs] = draftBomOutputs
    if (!replacement) {
      loadedBomDraftSignatureRef.current = 'new:'
      setSelectedMaterialId('')
      setSelectedBomId('__new__')
      setDraftBomOutputQuantity('1')
      setDraftBomOutputUnit('件')
      return
    }

    const replacementMaterial = bomMaterialById.get(replacement.materialId)
    if (!replacementMaterial) return
    const replacementProduct = bomProductByMaterialId.get(replacement.materialId)
    loadedBomDraftSignatureRef.current = `new:${replacementProduct?.id || ''}`
    setSelectedMaterialId(replacement.materialId)
    setSelectedBomId('__new__')
    setDraftBomOutputQuantity(String(replacement.quantity))
    setDraftBomOutputUnit(replacement.unit)
    setDraftBomOutputs(remainingOutputs)
    if (selectedBom) onMessage('主产出已更换；保存时将创建新方案，原 BOM 保持不变')
  }, [bomMaterialById, bomProductByMaterialId, draftBomOutputs, onMessage, selectedBom])

  const convertDraftQuantityForUnit = useCallback((
    quantity: number | string,
    fromUnit: string,
    toUnit: string,
    material: BomMaterialOption,
  ): string => {
    if (String(quantity).trim() === '') return String(quantity)
    return String(convertBomEntryQuantity(Number(quantity), fromUnit, toUnit, material, unitCatalog))
  }, [unitCatalog])

  const changeDraftInputUnit = useCallback((clientId: string, nextUnit: string) => {
    setDraftBomItems((current) => current.map((item) => {
      if (item.clientId !== clientId) return item
      const material = bomMaterialById.get(item.materialId)
      if (!material) return item
      try {
        return {
          ...item,
          quantity: convertDraftQuantityForUnit(item.quantity, item.unit, nextUnit, material),
          unit: nextUnit,
        }
      } catch (error) {
        onMessage(error instanceof Error ? error.message : '单位换算失败')
        return item
      }
    }))
  }, [bomMaterialById, convertDraftQuantityForUnit, onMessage])

  const changeDraftOutputUnit = useCallback((clientId: string, nextUnit: string) => {
    setDraftBomOutputs((current) => current.map((output) => {
      if (output.clientId !== clientId) return output
      const material = bomMaterialById.get(output.materialId)
      if (!material) return output
      try {
        return {
          ...output,
          quantity: convertDraftQuantityForUnit(output.quantity, output.unit, nextUnit, material),
          unit: nextUnit,
        }
      } catch (error) {
        onMessage(error instanceof Error ? error.message : '单位换算失败')
        return output
      }
    }))
  }, [bomMaterialById, convertDraftQuantityForUnit, onMessage])

  const changePrimaryOutputUnit = useCallback((nextUnit: string) => {
    if (!selectedMaterial) return
    try {
      setDraftBomOutputQuantity((current) => convertDraftQuantityForUnit(current, draftBomOutputUnit, nextUnit, selectedMaterial))
      setDraftBomOutputUnit(nextUnit)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '单位换算失败')
    }
  }, [convertDraftQuantityForUnit, draftBomOutputUnit, onMessage, selectedMaterial])

  const selectExistingBom = useCallback((materialId: string, bomId: string) => {
    loadedBomDraftSignatureRef.current = ''
    setSelectedMaterialId(materialId)
    setSelectedBomId(bomId)
  }, [])

  const openQuickBomCreate = useCallback((materialId: string) => {
    setQuickBomMaterialId(materialId)
    setQuickBomDraftReady(false)
    if (!bomDataReady && !bomLoading) void fetchBomData()
  }, [bomDataReady, bomLoading, fetchBomData])

  const closeQuickBomCreate = useCallback(() => {
    if (bomSaving) return
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
  }, [bomSaving])

  useEffect(() => {
    if (showBomWorkspace || !quickBomMaterialId || quickBomDraftReady || !bomDataReady) return
    if (!bomMaterialById.has(quickBomMaterialId)) {
      onMessage('目标物料不存在或已归档')
      setQuickBomMaterialId(null)
      return
    }
    selectMaterialForBom(quickBomMaterialId)
    setQuickBomDraftReady(true)
  }, [bomDataReady, bomMaterialById, onMessage, quickBomDraftReady, quickBomMaterialId, selectMaterialForBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomDataReady || !openBomRequest) return
    if (handledBomOpenRequestRef.current === openBomRequest.requestId) return
    handledBomOpenRequestRef.current = openBomRequest.requestId
    bomWorkspaceStateRestoredRef.current = true
    if (!openBomRequest.bomId) {
      if (!bomMaterialById.has(openBomRequest.materialId)) {
        onMessage('目标物料不存在或已归档')
        onOpenBomRequestHandled?.()
        return
      }
      selectMaterialForBom(openBomRequest.materialId)
      onOpenBomRequestHandled?.()
      return
    }
    const product = bomProductByMaterialId.get(openBomRequest.materialId)
    if (!product?.boms.some((bom) => bom.id === openBomRequest.bomId)) {
      onMessage('目标 BOM 不存在或已归档')
      onOpenBomRequestHandled?.()
      return
    }
    selectExistingBom(openBomRequest.materialId, openBomRequest.bomId)
    onOpenBomRequestHandled?.()
  }, [bomDataReady, bomMaterialById, bomProductByMaterialId, onMessage, onOpenBomRequestHandled, openBomRequest, selectExistingBom, selectMaterialForBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomDataReady || bomWorkspaceStateRestoredRef.current) return
    bomWorkspaceStateRestoredRef.current = true
    try {
      const saved = JSON.parse(window.localStorage.getItem(bomWorkspaceStateStorageKey) || '{}') as {
        materialId?: string
        bomId?: string
      }
      if (!saved.materialId || !saved.bomId) return
      const product = bomProductByMaterialId.get(saved.materialId)
      if (!product?.boms.some((bom) => bom.id === saved.bomId)) return
      selectExistingBom(saved.materialId, saved.bomId)
    } catch (error) {
      window.localStorage.removeItem(bomWorkspaceStateStorageKey)
    }
  }, [bomDataReady, bomProductByMaterialId, selectExistingBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomWorkspaceStateRestoredRef.current) return
    window.localStorage.setItem(bomWorkspaceStateStorageKey, JSON.stringify({
      materialId: selectedBomId && selectedBomId !== '__new__' ? selectedMaterialId : undefined,
      bomId: selectedBomId && selectedBomId !== '__new__' ? selectedBomId : undefined,
    }))
  }, [selectedBomId, selectedMaterialId, showBomWorkspace])

  const saveBomForProduct = async (
    productId: string,
    items: DraftBomItem[],
    successMessage = 'BOM 已保存',
  ): Promise<boolean> => {
    const invalidItem = items.find((item) => !item.materialId || Number(item.quantity) <= 0)
    if (invalidItem) {
      onMessage('请为每种投入物料填写大于 0 的每批数量')
      return false
    }
    const invalidOutput = draftBomOutputs.find((output) => !output.materialId || Number(output.quantity) <= 0)
    if (invalidOutput) {
      onMessage('请为每项产出填写大于 0 的基准数量')
      return false
    }
    setBomSaving(true)
    try {
      const res = await fetch('/api/boms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          bomId: selectedBom?.id,
          createNew: selectedBomId === '__new__',
          name: draftBomName.trim(),
          purpose: draftBomPurpose,
          isDefault: draftBomIsDefault,
          isActive: selectedBom?.isActive ?? true,
          outputQuantity: selectedBomOutputQuantity,
          outputs: [
            {
              materialId: selectedMaterial?.id,
              quantity: selectedBomOutputQuantity,
              entryUnit: draftBomOutputUnit,
              isPrimary: true,
            },
            ...draftBomOutputs.map((output) => ({
              materialId: output.materialId,
              quantity: Number(output.quantity),
              entryUnit: output.unit,
              isPrimary: false,
            })),
          ],
          items: items.map((item) => ({
            materialId: item.materialId,
            quantity: Number(item.quantity),
            entryUnit: item.unit,
            wastageRate: 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存 BOM 批次配方失败')
        return false
      }
      onMessage(successMessage || data.message || 'BOM 批次配方已保存')
      await fetchBomData(data.data?.id)
      return true
    } catch (err) {
      onMessage('保存 BOM 批次配方失败')
      return false
    } finally {
      setBomSaving(false)
    }
  }

  const saveSelectedBom = async (): Promise<boolean> => {
    if (!selectedMaterial) {
      onMessage('请先添加主产出物料')
      return false
    }
    if (draftBomItems.length === 0) {
      onMessage('请至少添加一项投入物料')
      return false
    }
    if (!draftBomName.trim()) {
      onMessage('请填写 BOM 名称')
      return false
    }
    if (!Number.isFinite(selectedBomOutputQuantity) || selectedBomOutputQuantity <= 0) {
      onMessage('基准产出数量必须大于 0')
      return false
    }
    return saveBomForProduct(
      selectedBomProduct?.id || `${materialProductPrefix}${selectedMaterial.id}`,
      draftBomItems,
      'BOM 已保存',
    )
  }

  const saveQuickBom = async () => {
    const saved = await saveSelectedBom()
    if (!saved) return
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
  }

  const openFullBomEditorFromQuickCreate = () => {
    if (!quickBomMaterialId || !onOpenBomWorkspace || bomSaving) return
    const materialId = quickBomMaterialId
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
    onOpenBomWorkspace(materialId)
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
    if (canUseBomData && bomStatusFilter !== 'all') {
      labels.push(bomStatusOptions.find((option) => option.value === bomStatusFilter)?.label || '指定 BOM 状态')
    }
    if (sortBy !== 'createdAt' || sortDir !== 'desc') {
      labels.push(`排序 ${materialSortOptions.find((option) => option.value === sortBy)?.label || sortBy}/${sortDir === 'asc' ? '升序' : '降序'}`)
    }
    if (
      visibleFields.length !== defaultMaterialVisibleFields.length
      || visibleFields.some((field, index) => field !== defaultMaterialVisibleFields[index])
      || (canUseBomData && !bomSummaryVisible)
    ) {
      labels.push('字段显示')
    }
    return labels
  }, [selectedCategories, customerFilter, customers, bomStatusFilter, sortBy, sortDir, visibleFields, bomSummaryVisible, canUseBomData])

  useEffect(() => {
    if (!onToolbarChange) return

    if (showBomWorkspace) {
      onToolbarChange(
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.boms"
              value={bomKeyword}
              onChange={setBomKeyword}
              placeholder="搜索产出、投入物料、BOM 或版本"
            />
          )}
          actions={(
            <AppButton variant="create" onClick={() => selectMaterialForBom('')}>
              新建 BOM
            </AppButton>
          )}
        />
      )
      return () => onToolbarChange(null)
    }

    onToolbarChange(
      <ResponsiveToolbarActions
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.materials"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索物料名称或编码"
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
            {canUseBomData && (
              <select
                value={bomStatusFilter}
                onChange={(event) => setBomStatusFilter(event.target.value as BomStatusFilter)}
                className="w-56 rounded-lg border border-gray-200 px-4 py-2 text-sm"
              >
                {bomStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as MaterialSortBy)}
                className="w-40 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                {materialSortOptions.filter((option) => option.value !== 'bomSummary' || canUseBomData).map((option) => (
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
            {canUseBomData && (
              <BomSummaryVisibilityControl
                visible={bomSummaryVisible}
                value={bomSummaryFields}
                onVisibleChange={updateBomSummaryVisible}
                onChange={updateBomSummaryFields}
              />
            )}
            {viewMode === 'list' && Object.keys(columnWidths).length > 0 && (
              <button
                type="button"
                onClick={resetAllColumnWidths}
                className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                恢复自动列宽
              </button>
            )}
          </>
        )}
        actions={(
          <>
            <div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <AppButton
              variant="create"
              onClick={handleAdd}
            >
              新增
            </AppButton>
            <AppButton
              onClick={openImportModal}
            >
              导入
            </AppButton>
            <AppButton
              onClick={handleExport}
            >
              导出
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedCategories, keyword, customerFilter, customers, bomStatusFilter, sortBy, sortDir, viewMode, setViewMode, visibleFields, bomSummaryVisible, bomSummaryFields, activeFilterLabels, showBomWorkspace, columnWidths, resetAllColumnWidths, bomKeyword, selectMaterialForBom, canUseBomData])

  const renderBomDraftEditor = (showSaveAction: boolean) => (
    <>
      <div className="rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 divide-y divide-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <section className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">输入</h4>
              <span className="text-xs text-gray-500">{draftBomItems.length} 项</span>
            </div>
            <BomMaterialSelectSearch
              value=""
              materials={bomMaterialOptions}
              disabledIds={[
                ...(selectedMaterialId ? [selectedMaterialId] : []),
                ...draftBomOutputs.map((output) => output.materialId),
                ...draftBomItems.map((item) => item.materialId),
              ]}
              onChange={(value) => {
                if (value) addInputMaterialToDraft(value)
              }}
            />
            <div className="mt-3 divide-y divide-gray-100">
              {draftBomItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">暂无投入物料</div>
              ) : draftBomItems.map((item) => {
                const material = bomMaterialById.get(item.materialId)
                return (
                  <div key={item.clientId} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                    <div className="col-span-2 min-w-0 2xl:col-span-1">
                      <BomMaterialIdentity
                        material={material}
                        fallbackId={item.materialId}
                        onPreview={setPreviewBomMaterial}
                      />
                    </div>
                    {material && (
                      <div className="min-w-0">
                        <BomQuantityEditor
                          label={`${material.name}每批投入数量`}
                          value={item.quantity}
                          unit={item.unit}
                          material={material}
                          unitCatalog={unitCatalog}
                          onValueChange={(quantity) => setDraftBomItems((current) => current.map((draft) => (
                            draft.clientId === item.clientId ? { ...draft, quantity } : draft
                          )))}
                          onUnitChange={(unit) => changeDraftInputUnit(item.clientId, unit)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setDraftBomItems((current) => current.filter((draft) => draft.clientId !== item.clientId))}
                      className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                    >
                      移除
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">输出</h4>
              <span className="text-xs text-gray-500">{selectedMaterial ? 1 + draftBomOutputs.length : 0} 项</span>
            </div>
            <SearchableSelect
              value=""
              options={bomOutputMaterialOptions.filter((option) => (
                option.value !== selectedMaterialId
                && !draftBomOutputs.some((output) => output.materialId === option.value)
                && !draftBomItems.some((item) => item.materialId === option.value)
              ))}
              onChange={(value) => {
                if (value) addOutputMaterialToDraft(value)
              }}
              placeholder={selectedMaterial ? '输入并选择下一项产出物料' : '输入并选择首项主产出物料'}
              emptyText="没有匹配的产出物料"
              className="w-full"
            />
            <div className="mt-3 divide-y divide-gray-100">
              {!selectedMaterial ? (
                <div className="py-8 text-center text-sm text-gray-400">暂无产出物料</div>
              ) : (
                <div className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                  <div className="col-span-2 min-w-0 2xl:col-span-1">
                    <BomMaterialIdentity
                      material={selectedMaterial}
                      fallbackId={selectedMaterial.id}
                      badge={<span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">主产出</span>}
                      onPreview={setPreviewBomMaterial}
                    />
                  </div>
                  <div className="min-w-0">
                    <BomQuantityEditor
                      label={`${selectedMaterial.name}每批产出数量`}
                      value={draftBomOutputQuantity}
                      unit={draftBomOutputUnit}
                      material={selectedMaterial}
                      unitCatalog={unitCatalog}
                      onValueChange={setDraftBomOutputQuantity}
                      onUnitChange={changePrimaryOutputUnit}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={removePrimaryOutput}
                    className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                  >
                    移除
                  </button>
                </div>
              )}
              {draftBomOutputs.map((output) => {
                const material = bomMaterialById.get(output.materialId)
                return (
                  <div key={output.clientId} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                    <div className="col-span-2 min-w-0 2xl:col-span-1">
                      <BomMaterialIdentity
                        material={material}
                        fallbackId={output.materialId}
                        onPreview={setPreviewBomMaterial}
                      />
                    </div>
                    {material && (
                      <div className="min-w-0">
                        <BomQuantityEditor
                          label={`${material.name}每批产出数量`}
                          value={output.quantity}
                          unit={output.unit}
                          material={material}
                          unitCatalog={unitCatalog}
                          onValueChange={(quantity) => setDraftBomOutputs((current) => current.map((draft) => (
                            draft.clientId === output.clientId ? { ...draft, quantity } : draft
                          )))}
                          onUnitChange={(unit) => changeDraftOutputUnit(output.clientId, unit)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setDraftBomOutputs((current) => current.filter((draft) => draft.clientId !== output.clientId))}
                      className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                    >
                      移除
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-gray-200 pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <label className="block text-xs font-medium text-gray-700">
            BOM 方案名称
            <input
              value={draftBomName}
              onChange={(event) => setDraftBomName(event.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：一模两件冲压方案"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="BOM 用途">
              {([['PRODUCTION', '生产 BOM'], ['PACKAGING', '包装 BOM']] as const).map(([purpose, label]) => (
                <button
                  key={purpose}
                  type="button"
                  aria-pressed={draftBomPurpose === purpose}
                  onClick={() => setDraftBomPurpose(purpose)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${draftBomPurpose === purpose ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={draftBomIsDefault}
                onChange={(event) => setDraftBomIsDefault(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              默认 BOM
            </label>
            <span>{selectedBom ? `版本 ${selectedBom.version}` : '保存时自动生成版本'}</span>
            <span className={draftBomDirty ? 'font-medium text-amber-700' : 'text-gray-400'}>
              {draftBomDirty ? '有未保存修改' : '已保存'}
            </span>
          </div>
        </div>
        {showSaveAction && (
          <button
            type="button"
            onClick={saveSelectedBom}
            disabled={bomSaving || !selectedMaterial || !draftBomDirty}
            title={!selectedMaterial ? '请先添加产出物料' : !draftBomDirty ? '当前没有待保存修改' : undefined}
            className="shrink-0 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bomSaving ? '保存中...' : '保存 BOM'}
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      <TopBarPortal>
        {showBomWorkspace ? (
          <ResponsiveToolbarActions
            primaryFilters={(
              <SearchFieldWithPresets
                storageKey="mes-lite.searchPresets.boms"
                value={bomKeyword}
                onChange={setBomKeyword}
                placeholder="搜索产出、投入物料、BOM 或版本"
              />
            )}
            actions={(
              <AppButton variant="create" onClick={() => selectMaterialForBom('')}>
                新建 BOM
              </AppButton>
            )}
          />
        ) : (
          <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.materials"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索物料名称或编码"
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
              {canUseBomData && (
                <select
                  value={bomStatusFilter}
                  onChange={(event) => setBomStatusFilter(event.target.value as BomStatusFilter)}
                  className="w-56 rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  {bomStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )}
              <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as MaterialSortBy)}
                  className="w-40 px-4 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {materialSortOptions.filter((option) => option.value !== 'bomSummary' || canUseBomData).map((option) => (
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
              {canUseBomData && (
                <BomSummaryVisibilityControl
                  visible={bomSummaryVisible}
                  value={bomSummaryFields}
                  onVisibleChange={updateBomSummaryVisible}
                  onChange={updateBomSummaryFields}
                />
              )}
              {viewMode === 'list' && Object.keys(columnWidths).length > 0 && (
                <button
                  type="button"
                  onClick={resetAllColumnWidths}
                  className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  恢复自动列宽
                </button>
              )}
            </>
          )}
          actions={(
            <>
              <div>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
              <AppButton
                variant="create"
                onClick={handleAdd}
              >
                新增
              </AppButton>
              <AppButton
                onClick={openImportModal}
              >
                导入
              </AppButton>
              <AppButton
                onClick={handleExport}
              >
                导出
              </AppButton>
            </>
          )}
          />
        )}
      </TopBarPortal>
      <div className="min-w-0">
        {!showBomWorkspace && (
        <div
          className="min-w-0 rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-4 sm:shadow"
        >
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
        ) : viewMode === 'card' ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] items-start gap-3">
              {materials.map((material) => {
                const bomSummary = canUseBomData && bomSummaryVisible ? getBomSummary(material) : null
                const isSelected = showBomWorkspace && material.id === selectedMaterialId
                return (
                <div
                  key={material.id}
                  onClick={() => {
                    if (showBomWorkspace) selectMaterialForBom(material.id)
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
                        <div className="text-xs text-gray-500">参考数量</div>
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
                  <div className={`mt-2 overflow-hidden rounded border-l-2 px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="shrink-0 font-medium">BOM</span>
                      <span className="min-w-0 truncate">组成 {bomSummary.componentCount} · 被引用 {bomSummary.usageCount}</span>
                    </div>
                    <div className="mt-0.5 truncate" title={bomSummary.text}>{bomSummary.text}</div>
                  </div>
                )}
                <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
                  {canCreateBom && (
                    <button
                      onClick={() => openQuickBomCreate(material.id)}
                      className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50"
                    >
                      创建 BOM
                    </button>
                  )}
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
              <table className="min-w-full table-auto">
              <thead className={showBomWorkspace ? 'sticky top-0 z-10 bg-gray-50' : 'bg-gray-50'}>
                <tr>
                  {showField('image') && <MaterialTableHeader columnKey="image" label="图片" style={columnStyle('image')} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('code') && <MaterialSortableHeader columnKey="code" field="code" label="物料编码" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('code')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  <MaterialSortableHeader columnKey="name" field="name" label="物料名称" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('name')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />
                  {showField('category') && <MaterialSortableHeader columnKey="category" field="category" label="分类" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('category')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('customer') && <MaterialSortableHeader columnKey="customer" field="customer" label="归属客户" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('customer')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('spec') && <MaterialSortableHeader columnKey="spec" field="spec" label="规格" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('spec')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('note') && <MaterialSortableHeader columnKey="note" field="note" label="备注" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('note')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('stockUnit') && <MaterialSortableHeader columnKey="stockUnit" field="stockUnit" label="库存单位" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('stockUnit')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('valuationUnit') && <MaterialSortableHeader columnKey="valuationUnit" field="valuationUnit" label="参考/计价单位" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('valuationUnit')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('stock') && <MaterialSortableHeader columnKey="stock" field="stock" label="库存" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('stock')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('valuationStock') && <MaterialSortableHeader columnKey="valuationStock" field="valuationStock" label="参考数量" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('valuationStock')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {showField('createdAt') && <MaterialSortableHeader columnKey="createdAt" field="createdAt" label="创建时间" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('createdAt')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  {canUseBomData && bomSummaryVisible && <MaterialSortableHeader columnKey="bomSummary" field="bomSummary" label="BOM 简况" sortBy={sortBy} sortDir={sortDir} className="" style={columnStyle('bomSummary')} onSort={handleHeaderSort} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />}
                  <MaterialTableHeader columnKey="actions" label="操作" style={columnStyle('actions')} onResize={startColumnResize} onReset={resetColumnWidth} onNudge={nudgeColumnWidth} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((material) => {
                  const bomSummary = canUseBomData && bomSummaryVisible ? getBomSummary(material) : null
                  const isSelected = showBomWorkspace && material.id === selectedMaterialId
                  return (
                  <tr
                    key={material.id}
                    onClick={() => {
                      if (showBomWorkspace) selectMaterialForBom(material.id)
                    }}
                    className={`align-top transition ${showBomWorkspace ? 'cursor-pointer' : ''} ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    {showField('image') && (
                      <td style={columnStyle('image')} className="overflow-hidden px-4 py-3">
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
                    {showField('code') && <td style={columnStyle('code')} className="overflow-hidden px-4 py-3 font-mono text-sm text-blue-600"><div className="truncate" title={material.code}>{material.code}</div></td>}
                    <td style={columnStyle('name')} className="overflow-hidden px-4 py-3 text-sm font-medium"><div className="truncate" title={material.name}>{material.name}</div></td>
                    {showField('category') && <td style={columnStyle('category')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</div></td>}
                    {showField('customer') && <td style={columnStyle('customer')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate" title={material.customer?.name || '通用/未绑定'}>{material.customer?.name || '通用/未绑定'}</div></td>}
                    {showField('spec') && <td style={columnStyle('spec')} className="overflow-hidden px-4 py-3 text-sm text-gray-500"><div className="truncate" title={material.spec || '-'}>{material.spec || '-'}</div></td>}
                    {showField('note') && <td style={columnStyle('note')} className="overflow-hidden px-4 py-3 text-sm text-gray-500"><div className="line-clamp-2" title={material.note || '-'}>{material.note || '-'}</div></td>}
                    {showField('stockUnit') && <td style={columnStyle('stockUnit')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{material.stockUnit || material.unit}</div></td>}
                    {showField('valuationUnit') && (
                      <td style={columnStyle('valuationUnit')} className="overflow-hidden px-4 py-3 text-sm">
                        <div className="truncate">{material.valuationUnit || material.unit}</div>
                        <div className="truncate text-xs text-gray-500">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</div>
                        <div className="truncate text-xs text-gray-500">成本法：{material.costingMethod === 'FIFO' ? '先入先出' : '移动加权平均'}</div>
                      </td>
                    )}
                    {showField('stock') && <td style={columnStyle('stock')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{material.stock?.qty || 0} {material.stockUnit || material.unit}</div></td>}
                    {showField('valuationStock') && <td style={columnStyle('valuationStock')} className="overflow-hidden px-4 py-3 text-sm text-green-600"><div className="truncate">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</div></td>}
                    {showField('createdAt') && <td style={columnStyle('createdAt')} className="overflow-hidden px-4 py-3 text-xs text-gray-500"><div className="truncate">{new Date(material.createdAt).toLocaleString('zh-CN')}</div></td>}
                    {bomSummary && (
                      <td style={columnStyle('bomSummary')} className="overflow-hidden px-4 py-3 text-sm">
                        <div className={`overflow-hidden rounded-lg border px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <span className="shrink-0 font-medium">BOM</span>
                            <span className="min-w-0 truncate">组成 {bomSummary.componentCount} · 被引用 {bomSummary.usageCount}</span>
                          </div>
                          <div className="mt-1 truncate" title={bomSummary.text}>{bomSummary.text}</div>
                        </div>
                      </td>
                    )}
                    <td style={columnStyle('actions')} className="overflow-hidden whitespace-nowrap px-4 py-3">
                      {canCreateBom && (
                        <button
                          onClick={() => openQuickBomCreate(material.id)}
                          className="mr-2 rounded border border-emerald-300 px-3 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50"
                        >
                          创建 BOM
                        </button>
                      )}
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
        )}

        {showBomWorkspace && (
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <aside
            aria-label="已有 BOM 列表"
            className="min-w-0 rounded-lg bg-white p-3 shadow xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain"
          >
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">BOM 列表</h3>
                <p className="mt-0.5 text-xs text-gray-500">选择 BOM 后在右侧修改；可按产品或投入物料搜索</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {existingBomRows.length}
              </span>
            </div>

            {bomLoading ? (
              <AppLoadingIndicator compact label="正在加载 BOM..." className="rounded-lg border border-dashed border-gray-200" />
            ) : existingBomRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                {bomKeyword.trim()
                  ? '没有匹配的已有 BOM'
                  : '暂无已有 BOM，可点击“新建 BOM”创建'}
              </div>
            ) : (
              <div className="space-y-2">
                {existingBomRows.map(({ product, bom, materialId, material }) => {
                  const isSelected = selectedMaterialId === materialId && selectedBomId === bom.id
                  const primaryOutput = bom.outputs.find((output) => output.isPrimary)?.material || material
                  const inputMaterials = bom.items
                    .filter((item) => item.itemType === 'MATERIAL' && item.material)
                    .map((item) => item.material!)
                  const inputSummary = inputMaterials.length > 0
                    ? `${inputMaterials.slice(0, 2).map((item) => `${item.code} ${item.name}`).join('、')}${inputMaterials.length > 2 ? ` 等 ${inputMaterials.length} 项` : ''}`
                    : '暂无投入物料'
                  return (
                    <button
                      key={bom.id}
                      type="button"
                      onClick={() => selectExistingBom(materialId, bom.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-blue-600">BOM · {bom.version}</span>
                          <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">{bom.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${bom.purpose === 'PACKAGING' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                            {bom.purpose === 'PACKAGING' ? '包装' : '生产'}
                          </span>
                          {bom.isDefault && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">默认</span>}
                          {!bom.isActive && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">已停用</span>}
                        </span>
                      </span>
                      <span className="my-2 block border-t border-gray-100" />
                      <span className="block truncate text-xs text-gray-600">
                        主产出：{primaryOutput?.code || product.sku} · {primaryOutput?.name || product.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-gray-500" title={inputSummary}>
                        投入：{inputSummary}
                      </span>
                      <span className="mt-2 block text-[11px] text-gray-400">
                        投入 {bom.items.length} 项 · 产出 {bom.outputs.length} 项
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </aside>

          <div aria-label="BOM 创建与修改工作区" className="min-w-0 rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">创建 / 修改 BOM</h3>
                {bomLoading && <span className="text-xs text-gray-500">同步中...</span>}
              </div>
              <div className="mt-1 truncate text-sm text-gray-500">
                {selectedMaterial ? `${selectedMaterial.code} · ${selectedMaterial.name}` : '新建 BOM：分别添加每批投入和产出'}
              </div>
            </div>
            {bomLoading && <span className="shrink-0 text-xs text-gray-500">同步中...</span>}
          </div>

          {renderBomDraftEditor(true)}
          </div>
        </div>
        )}
      </div>

      {quickBomMaterialId && (
        <ModalDialog
          title="快速创建 BOM"
          description={quickBomDraftReady && selectedMaterial
            ? `${selectedMaterial.code} · ${selectedMaterial.name} 已作为主产出`
            : '正在准备当前物料的 BOM 草稿...'}
          headerActions={onOpenBomWorkspace && quickBomDraftReady ? (
            <AppButton variant="secondary" onClick={openFullBomEditorFromQuickCreate} disabled={bomSaving}>
              完整 BOM 设置
            </AppButton>
          ) : undefined}
          onClose={closeQuickBomCreate}
          closeDisabled={bomSaving}
          size="wide"
          bodyClassName="bg-gray-50/40"
          footer={(
            <ModalActions
              onCancel={closeQuickBomCreate}
              onConfirm={saveQuickBom}
              cancelLabel="取消"
              confirmLabel="保存 BOM"
              disabled={!quickBomDraftReady || !selectedMaterial || !draftBomDirty}
              busy={bomSaving}
            />
          )}
        >
          {quickBomDraftReady ? (
            renderBomDraftEditor(false)
          ) : (
            <AppLoadingIndicator compact label="正在加载 BOM 数据..." />
          )}
        </ModalDialog>
      )}

      {previewBomMaterial?.primaryImage && (
        <ModalDialog
          title={previewBomMaterial.name}
          description={[previewBomMaterial.code, previewBomMaterial.spec].filter(Boolean).join(' · ')}
          onClose={() => setPreviewBomMaterial(null)}
          size="wide"
          footer={<AppButton variant="primary" onClick={() => setPreviewBomMaterial(null)}>关闭</AppButton>}
        >
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-gray-50 p-3">
            <img
              src={previewBomMaterial.primaryImage.url}
              alt={previewBomMaterial.primaryImage.note || previewBomMaterial.name}
              className="max-h-[70dvh] max-w-full object-contain"
            />
          </div>
        </ModalDialog>
      )}

      {showModal && (
        <ModalDialog
          title={editingMaterial ? '编辑物料' : '新增物料'}
          description="维护物料基础资料、库存主单位和参考计价单位。"
          onClose={() => setShowModal(false)}
          closeDisabled={loading}
          size="wide"
          footer={(
            <ModalActions
              onCancel={() => setShowModal(false)}
              onConfirm={handleSubmit}
              confirmLabel="保存"
              busy={loading}
            />
          )}
        >
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
                      <SearchableSelect
                        value={form.customerId}
                        onChange={(customerId) => setForm({ ...form, customerId })}
                        options={[
                          { value: '', label: '通用/未绑定客户' },
                          ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` })),
                        ]}
                        placeholder="输入客户编码或名称筛选"
                      />
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">主计量方式 *</label>
                      <select
                        value={form.primaryMeasure}
                        onChange={(event) => {
                          const primaryMeasure = event.target.value
                          const defaultUnit = unitCatalog.find((unit) => unit.measureType === primaryMeasure && unit.isBase)?.code
                            || (primaryMeasure === 'LENGTH' ? 'm' : primaryMeasure === 'WEIGHT' ? 'kg' : primaryMeasure === 'QUANTITY' ? '件' : '项')
                          setForm({ ...form, primaryMeasure, stockUnit: defaultUnit, unit: defaultUnit })
                        }}
                        className="w-full rounded-lg border border-gray-200 px-4 py-2"
                      >
                        {primaryMeasureOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">库存、领料和生产耗用均按主计量方式记账。</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">主库存单位 *</label>
                      <SearchableSelect
                        value={form.stockUnit}
                        onChange={(stockUnit) => setForm({ ...form, stockUnit, unit: stockUnit })}
                        options={[
                          ...(!formStockUnitConfigured && form.stockUnit ? [{ value: form.stockUnit, label: `旧单位：${form.stockUnit}（待配置）` }] : []),
                          ...formStockUnitOptions.map((unit) => ({
                            value: unit.code,
                            label: `${unit.name}（${unit.code}） · 1 ${unit.code} = ${unit.toBaseFactor} ${formStockUnitOptions.find((item) => item.isBase)?.code || '基准单位'}`,
                          })),
                        ]}
                        placeholder="输入单位名称或编码筛选"
                      />
                      <p className="mt-1 text-xs text-gray-500">只能选择系统单位目录中的单位；新增单位请到“配置 → 单位配置”。</p>
                      {editingMaterial && (editingMaterial.stockUnit || editingMaterial.unit) !== form.stockUnit && (
                        <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                          将从 {editingMaterial.stockUnit || editingMaterial.unit} 改为 {form.stockUnit || '空'}。系统只修改物料主数据并记录审计，不换算数值，也不改写历史业务记录和既有 BOM。
                        </p>
                      )}
                    </div>
                    <label className="flex min-h-[42px] items-center gap-2 self-end rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.useDualUnit}
                        onChange={(e) => setForm({
                          ...form,
                          useDualUnit: e.target.checked,
                          valuationUnit: e.target.checked
                            ? form.valuationUnit || unitCatalog.find((unit) => unit.measureType === form.referenceMeasure && unit.isBase)?.code || ''
                            : '',
                          conversionRate: e.target.checked ? form.conversionRate : 1,
                          conversionNote: e.target.checked ? form.conversionNote : '',
                        })}
                        className="h-4 w-4"
                      />
                      记录参考/计价单位
                    </label>
                  </div>
                  {form.useDualUnit && (
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">参考计量方式 *</label>
                        <select
                          value={form.referenceMeasure}
                          onChange={(event) => {
                            const referenceMeasure = event.target.value
                            const valuationUnit = unitCatalog.find((unit) => unit.measureType === referenceMeasure && unit.isBase)?.code || ''
                            setForm({ ...form, referenceMeasure, valuationUnit })
                          }}
                          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2"
                        >
                          {primaryMeasureOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">参考/计价单位 *</label>
                        <SearchableSelect
                          value={form.valuationUnit}
                          onChange={(valuationUnit) => setForm({ ...form, valuationUnit })}
                          options={[
                            ...(!formValuationUnitConfigured && form.valuationUnit ? [{ value: form.valuationUnit, label: `旧单位：${form.valuationUnit}（待配置）` }] : []),
                            ...formValuationUnitOptions.map((unit) => ({ value: unit.code, label: `${unit.name}（${unit.code}）` })),
                          ]}
                          placeholder="输入单位名称或编码筛选"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">默认参考换算 *</label>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={form.conversionRate || ''}
                          onChange={(e) => setForm({ ...form, conversionRate: Number(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          placeholder="例如：2.35"
                        />
                        <p className="mt-1 text-xs text-gray-500">仅在来料未填实测值时参考：1 {form.stockUnit || '主单位'} = {form.conversionRate || 0} {form.valuationUnit || '参考单位'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">换算说明</label>
                        <input
                          type="text"
                          value={form.conversionNote}
                          onChange={(e) => setForm({ ...form, conversionNote: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          placeholder="如：仅作缺少实测时的参考，来料实际值优先"
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">物料不保存标准长度。长度型原料在每张来料单按根数及总长度/单根长度录入本批实际长度。</p>
                </section>
              </div>
        </ModalDialog>
      )}

      {showImportModal && (
        <ModalDialog
          title="批量导入物料"
          description="仅导入物料主数据，不导入库存数量和成本。"
          onClose={() => setShowImportModal(false)}
          closeDisabled={importLoading}
          size="lg"
          footer={(
            <ModalActions
              onCancel={() => setShowImportModal(false)}
              onConfirm={handleImportSubmit}
              confirmLabel="开始导入"
              busy={importLoading}
            />
          )}
        >
            <div className="space-y-5">
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
        </ModalDialog>
      )}

      {detailMaterial && (
        <ModalDialog
          title="物料详情"
          description={`${detailMaterial.code} · ${detailMaterial.name}`}
          onClose={() => setDetailMaterial(null)}
          size="xl"
          headerActions={(
            <>
                <AppButton
                  onClick={() => handleOpenPanorama(detailMaterial)}
                  variant="create"
                  size="sm"
                >
                  全景
                </AppButton>
                <AppButton
                  onClick={handleEditFromDetail}
                  size="sm"
                >
                  编辑资料
                </AppButton>
            </>
          )}
          bodyClassName="space-y-6"
        >
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
                      <dt className="text-xs text-gray-500">主计量方式</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{primaryMeasureLabels[detailMaterial.primaryMeasure] || '其他'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">参考/计价单位</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">
                        {detailMaterial.referenceMeasure ? `${primaryMeasureLabels[detailMaterial.referenceMeasure]} · ` : ''}{detailMaterial.valuationUnit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">参考数量</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.stock?.valuationQty || 0} {detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">默认参考换算</dt>
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
        </ModalDialog>
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
