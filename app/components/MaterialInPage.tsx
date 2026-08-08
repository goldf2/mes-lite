'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import AttachmentPanel from './AttachmentPanel'
import { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'
import { MaterialInPriceUnit, normalizeMaterialInPriceUnit } from '@/lib/material-in-quantity'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import { MappedResourceAdvancedSearch } from './resource'
import BusinessDocumentPrintLink, { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from './BusinessDocumentPrintLink'

const displayPriceUnit = (unit: string | null | undefined) => unit === 'm' ? '米' : unit || '-'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
}

interface Customer {
  id: string
  code: string
  name: string
}

interface InventoryLocation {
  id: string
  code: string
  name: string
  isDefault: boolean
}

interface Material {
  id: string
  code: string
  name: string
  spec?: string
  primaryMeasure: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'
  referenceMeasure?: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER' | null
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
}

interface MaterialIn {
  id: string
  inboundNo: string
  voucherNo?: string | null
  supplierId: string
  materialId: string
  locationId: string
  qty: number
  unit: string
  pieceCount?: number | null
  stockQtyMode: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number | null
  totalLength?: number | null
  totalWeight?: number | null
  valuationQty: number
  valuationUnit: string
  conversionRate: number
  conversionSource?: string
  stockUnitCost: number
  valuationUnitCost: number
  unitPrice: number
  priceBasis: string
  priceUnit?: string
  totalAmount: number
  batchNo?: string
  status: string
  inboundDate: string
  receivedBy?: string
  note?: string
  supplier: { id: string; code: string; name: string }
  material: Material
  location?: InventoryLocation | null
}

interface MaterialInDraftItem {
  id: string
  materialId: string
  locationId: string
  qty: number
  pieceCount?: number
  stockQtyMode?: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number
  totalLength?: number
  totalWeight?: number
  unit: string
  valuationUnit: string
  unitPrice: number
  totalAmount: number
  priceUnit: MaterialInPriceUnit
  priceBasis: 'VALUATION' | 'STOCK'
  batchNo?: string
}

function formatMaterialLabel(material: Material) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function materialIncludesKeyword(material: Material, keyword: string) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return true
  return [material.code, material.name, material.spec || '']
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedKeyword)
}

function formatSupplierLabel(supplier: Supplier) {
  return supplier.name
}

function supplierIncludesKeyword(supplier: Supplier, keyword: string) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return true
  return [supplier.name, supplier.contact || '', supplier.phone || '']
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedKeyword)
}

function SupplierSearchSelect({
  value,
  options,
  onChange,
  onSearch,
}: {
  value: string
  options: Supplier[]
  onChange: (supplier: Supplier | null) => void
  onSearch: (keyword: string) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = options.find((supplier) => supplier.id === value) || null
  const visibleOptions = useMemo(
    () => options.filter((supplier) => supplierIncludesKeyword(supplier, query)).slice(0, 50),
    [options, query]
  )

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      void onSearch(query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, query, onSearch])

  useEffect(() => {
    if (activeIndex >= visibleOptions.length) setActiveIndex(visibleOptions.length - 1)
  }, [activeIndex, visibleOptions.length])

  const selectSupplier = (supplier: Supplier | null) => {
    onChange(supplier)
    closePopup()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-label="供应商"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="material-in-supplier-options"
        aria-activedescendant={open && activeIndex >= 0 ? `material-in-supplier-option-${visibleOptions[activeIndex]?.id}` : undefined}
        value={open ? query : selected ? formatSupplierLabel(selected) : ''}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          setActiveIndex(-1)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closePopup()
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => Math.min(current + 1, visibleOptions.length - 1))
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => Math.max(current - 1, 0))
            return
          }
          if (event.key === 'Enter' && open && activeIndex >= 0 && visibleOptions[activeIndex]) {
            event.preventDefault()
            selectSupplier(visibleOptions[activeIndex])
          }
        }}
        placeholder="输入供应商名称、联系人或电话"
        className="w-full rounded-lg border border-gray-200 px-4 py-2 pr-14 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          type="button"
          aria-label="清除供应商"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectSupplier(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          清除
        </button>
      )}
      {open && (
        <div
          id="material-in-supplier-options"
          role="listbox"
          aria-label="供应商选项"
          className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {visibleOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">没有匹配供应商</div>
          ) : (
            visibleOptions.map((supplier, index) => (
              <button
                id={`material-in-supplier-option-${supplier.id}`}
                key={supplier.id}
                type="button"
                role="option"
                aria-selected={supplier.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSupplier(supplier)}
                className={`block w-full px-3 py-2 text-left ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
              >
                <div className="truncate text-sm font-medium text-gray-900">{supplier.name}</div>
                {(supplier.contact || supplier.phone) && (
                  <div className="mt-0.5 truncate text-xs text-gray-500">
                    {[supplier.contact, supplier.phone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            ))
          )}
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">输入名称、编码、联系人或电话继续筛选</div>
        </div>
      )}
    </div>
  )
}

function MaterialSearchSelect({
  value,
  options,
  onChange,
  onSearch,
}: {
  value: string
  options: Material[]
  onChange: (material: Material | null) => void
  onSearch: (keyword: string) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = options.find((material) => material.id === value) || null
  const visibleOptions = useMemo(
    () => options.filter((material) => materialIncludesKeyword(material, query)).slice(0, 50),
    [options, query]
  )

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      void onSearch(query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, query, onSearch])

  useEffect(() => {
    if (activeIndex >= visibleOptions.length) setActiveIndex(visibleOptions.length - 1)
  }, [activeIndex, visibleOptions.length])

  const selectMaterial = (material: Material | null) => {
    onChange(material)
    closePopup()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-label="物料"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="material-in-options"
        aria-activedescendant={open && activeIndex >= 0 ? `material-in-option-${visibleOptions[activeIndex]?.id}` : undefined}
        value={open ? query : selected ? formatMaterialLabel(selected) : ''}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          setActiveIndex(-1)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closePopup()
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => Math.min(current + 1, visibleOptions.length - 1))
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => Math.max(current - 1, 0))
            return
          }
          if (event.key === 'Enter' && open && activeIndex >= 0 && visibleOptions[activeIndex]) {
            event.preventDefault()
            selectMaterial(visibleOptions[activeIndex])
          }
        }}
        placeholder="输入物料名称、编码或规格"
        className="w-full rounded-lg border border-gray-200 px-4 py-2 pr-14 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          type="button"
          aria-label="清除物料"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectMaterial(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          清除
        </button>
      )}
      {open && (
        <div
          id="material-in-options"
          role="listbox"
          aria-label="物料选项"
          className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {visibleOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">没有匹配物料</div>
          ) : (
            visibleOptions.map((material, index) => (
              <button
                id={`material-in-option-${material.id}`}
                key={material.id}
                type="button"
                role="option"
                aria-selected={material.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectMaterial(material)}
                className={`block w-full px-3 py-2 text-left ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
              >
                <div className="truncate text-sm font-medium text-gray-900">{material.code} · {material.name}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{material.spec || '无规格'}</div>
              </button>
            ))
          )}
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">输入名称、编码或规格继续筛选</div>
        </div>
      )}
    </div>
  )
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  RECEIVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVERSED: 'bg-orange-100 text-orange-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待收货',
  RECEIVED: '已收货',
  REJECTED: '已拒收',
  REVERSED: '已红冲',
}

const statusOptions = [
  { value: 'PENDING', label: '待收货' },
  { value: 'RECEIVED', label: '已收货' },
  { value: 'REJECTED', label: '已拒收' },
  { value: 'REVERSED', label: '已红冲' },
]

export default function MaterialInPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [materialIns, setMaterialIns] = useState<MaterialIn[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MaterialIn | null>(null)
  const [draftItems, setDraftItems] = useState<MaterialInDraftItem[]>([])
  const [linkedBatchRatios, setLinkedBatchRatios] = useState<{ lengthPerPiece: number; weightPerLength: number } | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materialIn.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '归属客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'supplierId', label: '供应商', value: selectedSupplierId, onChange: setSelectedSupplierId, options: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })) },
  ], [customers, selectedCustomerId, selectedStatuses, selectedSupplierId, suppliers])

  const [form, setForm] = useState({
    voucherNo: '',
    supplierId: '',
    materialId: '',
    locationId: '',
    qty: 0,
    pieceCount: 0,
    stockQtyMode: 'TOTAL' as 'TOTAL' | 'PER_PIECE',
    stockQtyInput: 0,
    totalLength: 0,
    totalWeight: 0,
    unitPrice: 0,
    priceUnit: 'm' as MaterialInPriceUnit,
    totalAmount: 0,
    priceInputMode: 'UNIT' as 'UNIT' | 'TOTAL',
    batchNo: '',
    receivedBy: '',
    note: '',
  })
  const materialInSort = useClientTableSort(materialIns, {
    inboundNo: (item) => item.inboundNo,
    voucherNo: (item) => item.voucherNo,
    supplier: (item) => item.supplier?.name,
    material: (item) => `${item.material?.code || ''} ${item.material?.name || ''}`,
    location: (item) => item.location ? `${item.location.code} ${item.location.name}` : null,
    qty: (item) => item.qty,
    valuationQty: (item) => item.valuationQty,
    unitPrice: (item) => item.unitPrice,
    valuationUnitCost: (item) => item.valuationUnitCost,
    stockUnitCost: (item) => item.stockUnitCost,
    totalAmount: (item) => item.totalAmount,
    batchNo: (item) => item.batchNo,
    status: (item) => statusLabels[item.status] || item.status,
    inboundDate: (item) => new Date(item.inboundDate),
  }, 'inboundDate', 'desc')

  useEffect(() => {
    fetchMaterialIns()
    fetchSuppliers()
    fetchCustomers()
    fetchMaterials()
    fetchLocations()
  }, [keyword, selectedStatuses, selectedSupplierId, selectedCustomerId])

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/inventory-locations')
      if (!res.ok) return
      const data = await res.json()
      const options = data.data || []
      setLocations(options)
      setForm((current) => current.locationId ? current : {
        ...current,
        locationId: options.find((item: InventoryLocation) => item.isDefault)?.id || options[0]?.id || '',
      })
    } catch {
      // 由提交接口兜底使用默认库位
    }
  }

  const fetchMaterialIns = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedSupplierId) params.set('supplierId', selectedSupplierId)
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/material-ins?${params.toString()}` : '/api/material-ins'
      const res = await fetch(url)
      const data = await res.json()
      setMaterialIns(data.data || [])
    } catch (err) {
      onMessage('获取来料单列表失败')
    }
    setLoading(false)
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

  const fetchSuppliers = useCallback(async (searchKeyword = '') => {
    try {
      const params = new URLSearchParams()
      const normalizedKeyword = searchKeyword.trim()
      if (normalizedKeyword) params.set('keyword', normalizedKeyword)
      const url = params.toString() ? `/api/suppliers?${params.toString()}` : '/api/suppliers'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setSuppliers((current) => {
          const merged = new Map(current.map((supplier) => [supplier.id, supplier]))
          for (const supplier of data.data || []) merged.set(supplier.id, supplier)
          return Array.from(merged.values())
        })
      }
    } catch (err) {
      // ignore
    }
  }, [])

  const fetchMaterials = useCallback(async (searchKeyword = '') => {
    try {
      const params = new URLSearchParams({ pageSize: '50', sortBy: 'code', sortDir: 'asc' })
      const normalizedKeyword = searchKeyword.trim()
      if (normalizedKeyword) params.set('keyword', normalizedKeyword)
      const res = await fetch(`/api/materials?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setMaterials((current) => {
          const merged = new Map(current.map((material) => [material.id, material]))
          for (const material of data.data || []) merged.set(material.id, material)
          return Array.from(merged.values())
        })
      }
    } catch (err) {
      // ignore
    }
  }, [])

  const updateSelectedMaterial = (material: Material | null) => {
    setLinkedBatchRatios(null)
    setForm((current) => ({
      ...current,
      materialId: material?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      totalLength: 0,
      totalWeight: 0,
      unitPrice: 0,
      priceUnit: normalizeMaterialInPriceUnit(material?.stockUnit || material?.unit, material?.primaryMeasure),
      totalAmount: 0,
      priceInputMode: 'UNIT',
    }))
  }

  const resetForm = () => {
    setEditingItem(null)
    setDraftItems([])
    setLinkedBatchRatios(null)
    setForm({
      voucherNo: '',
      supplierId: '',
      materialId: '',
      locationId: locations.find((item) => item.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      totalLength: 0,
      totalWeight: 0,
      unitPrice: 0,
      priceUnit: 'm',
      totalAmount: 0,
      priceInputMode: 'UNIT',
      batchNo: '',
      receivedBy: '',
      note: '',
    })
  }

  const validateCurrentItem = () => {
    if (!form.materialId || !form.locationId || calculatedStockQty <= 0) {
      return '请选择物料和库位，并输入有效的主单位数量'
    }
    if (isLengthMaterial && form.pieceCount <= 0) return '长度型物料请填写数量'
    if (form.priceUnit === 'm' && totalAmountPreview > 0 && calculatedTotalLength <= 0) return '按米计价时请填写总长度'
    if (form.priceUnit === 'kg' && totalAmountPreview > 0 && form.totalWeight <= 0) return '按 kg 计价时请填写总重量'
    if (form.priceUnit === '件' && totalAmountPreview > 0 && form.pieceCount <= 0) return '按件计价时请填写数量'
    return null
  }

  const buildCurrentItem = (): MaterialInDraftItem => {
    const material = materials.find((item) => item.id === form.materialId)
    const stockUnit = material?.stockUnit || material?.unit || '个'
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      materialId: form.materialId,
      locationId: form.locationId,
      qty: calculatedStockQty,
      pieceCount: form.pieceCount > 0 ? form.pieceCount : undefined,
      stockQtyMode: isLengthMaterial ? form.stockQtyMode : undefined,
      stockQtyInput: isLengthMaterial ? form.stockQtyInput : undefined,
      totalLength: calculatedTotalLength > 0 ? calculatedTotalLength : undefined,
      totalWeight: form.totalWeight > 0 ? form.totalWeight : undefined,
      unit: stockUnit,
      valuationUnit: material?.valuationUnit || stockUnit,
      unitPrice: unitPricePreview,
      totalAmount: totalAmountPreview,
      priceUnit: form.priceUnit,
      priceBasis: form.priceUnit === 'kg' ? 'VALUATION' : 'STOCK',
      batchNo: form.batchNo || undefined,
    }
  }

  const resetCurrentItem = () => {
    setLinkedBatchRatios(null)
    setForm((current) => ({
      ...current,
      materialId: '',
      locationId: locations.find((item) => item.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      totalLength: 0,
      totalWeight: 0,
      unitPrice: 0,
      priceUnit: 'm',
      totalAmount: 0,
      priceInputMode: 'UNIT',
      batchNo: '',
    }))
  }

  const addCurrentItem = () => {
    const error = validateCurrentItem()
    if (error) {
      onMessage(error)
      return
    }
    setDraftItems((current) => [...current, buildCurrentItem()])
    resetCurrentItem()
    onMessage('物料明细已加入，可继续添加')
  }

  const handleSubmit = async () => {
    if (!form.supplierId) {
      onMessage('请选择供应商')
      return
    }
    let items = [...draftItems]
    if (form.materialId) {
      const error = validateCurrentItem()
      if (error) {
        onMessage(error)
        return
      }
      items = [...items, buildCurrentItem()]
    }
    if (editingItem && items.length !== 1) {
      onMessage('请填写有效的来料明细')
      return
    }
    if (!editingItem && items.length === 0) {
      onMessage('请至少添加一种物料')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const res = await fetch(editingItem ? `/api/material-ins/${editingItem.id}` : '/api/material-ins', {
        method: editingItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem ? {
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
          ...items[0],
          id: undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
        } : {
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
          items: items.map(({ id: _id, ...item }) => item),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(editingItem
          ? `来料单已修改：${data.data.inboundNo}`
          : `来料单创建成功，共 ${data.count || items.length} 种物料`)
        const pdfGenerated = await generateBusinessDocumentPdfArchives('material-in', (data.items || [data.data]).map((item: { id: string }) => item.id))
        if (pdfGenerated) printPreview.open('material-in', data.data.id)
        else {
          printPreview.close()
          onMessage('来料单已保存，但部分 PDF 生成失败，可在来料列表中重新打印')
        }
        setShowModal(false)
        resetForm()
        await fetchMaterialIns()
      } else {
        printPreview.close()
        onMessage(data.error || '创建来料单失败')
      }
    } catch (err) {
      printPreview.close()
      onMessage('创建来料单失败')
    }
    setLoading(false)
  }

  const selectedMaterial = materials.find((material) => material.id === form.materialId)
  const isLengthMaterial = selectedMaterial?.primaryMeasure === 'LENGTH'
  const calculatedTotalLength = isLengthMaterial
    ? Number(((form.stockQtyMode === 'PER_PIECE'
      ? Number(form.pieceCount || 0) * Number(form.stockQtyInput || 0)
      : Number(form.stockQtyInput || 0))).toFixed(6))
    : Number(form.totalLength || 0)
  const calculatedStockQty = selectedMaterial?.primaryMeasure === 'LENGTH'
    ? calculatedTotalLength
    : selectedMaterial?.primaryMeasure === 'WEIGHT'
      ? Number(form.totalWeight || 0)
      : selectedMaterial?.primaryMeasure === 'QUANTITY'
        ? Number(form.pieceCount || 0)
        : Number(form.qty || 0)
  const referenceValuationQty = selectedMaterial && calculatedStockQty > 0 ? Number((calculatedStockQty * (selectedMaterial.conversionRate || 1)).toFixed(6)) : 0
  const stockUnitLabel = selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
  const valuationUnitLabel = selectedMaterial?.valuationUnit || 'kg'
  const materialUsesDualUnit = Boolean(selectedMaterial && (stockUnitLabel !== valuationUnitLabel || Number(selectedMaterial.conversionRate || 1) !== 1))
  const actualReferenceQty = selectedMaterial?.referenceMeasure === 'LENGTH'
    ? calculatedTotalLength
    : selectedMaterial?.referenceMeasure === 'WEIGHT'
      ? Number(form.totalWeight || 0)
      : selectedMaterial?.referenceMeasure === 'QUANTITY'
        ? Number(form.pieceCount || 0)
        : 0
  const effectiveValuationQty = materialUsesDualUnit
    ? (actualReferenceQty > 0 ? actualReferenceQty : referenceValuationQty)
    : calculatedStockQty
  const actualConversionRate = calculatedStockQty > 0 && effectiveValuationQty > 0 ? Number((effectiveValuationQty / calculatedStockQty).toFixed(6)) : 0
  const priceQuantity = form.priceUnit === 'm'
    ? calculatedTotalLength
    : form.priceUnit === 'kg'
      ? Number(form.totalWeight || 0)
      : Number(form.pieceCount || 0)
  const totalAmountPreview = form.priceInputMode === 'TOTAL'
    ? Number(Number(form.totalAmount || 0).toFixed(6))
    : Number((priceQuantity * Number(form.unitPrice || 0)).toFixed(6))
  const unitPricePreview = form.priceInputMode === 'TOTAL'
    ? (priceQuantity > 0 ? Number((totalAmountPreview / priceQuantity).toFixed(6)) : 0)
    : Number(form.unitPrice || 0)
  const valuationUnitCostPreview = effectiveValuationQty > 0 ? Number((totalAmountPreview / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = calculatedStockQty > 0 ? Number((totalAmountPreview / calculatedStockQty).toFixed(6)) : 0
  const canLinkLengthWeight = isLengthMaterial
    && form.pieceCount > 0
    && calculatedStockQty > 0
    && form.totalWeight > 0

  const toggleBatchLink = () => {
    if (linkedBatchRatios) {
      setLinkedBatchRatios(null)
      return
    }
    if (!canLinkLengthWeight) {
      onMessage('请先填写数量、总长度和总重量，再开启比例联动')
      return
    }
    setLinkedBatchRatios({
      lengthPerPiece: calculatedStockQty / form.pieceCount,
      weightPerLength: form.totalWeight / calculatedStockQty,
    })
    setForm((current) => ({ ...current, stockQtyMode: 'TOTAL', stockQtyInput: calculatedStockQty }))
  }

  const updateLinkedPieceCount = (pieceCount: number) => {
    if (!linkedBatchRatios) {
      setForm({ ...form, pieceCount })
      return
    }
    const totalLength = Number((pieceCount * linkedBatchRatios.lengthPerPiece).toFixed(6))
    setForm({
      ...form,
      pieceCount,
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalLength = (totalLength: number) => {
    if (!linkedBatchRatios) {
      setForm({ ...form, stockQtyInput: totalLength, totalLength })
      return
    }
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalWeight = (totalWeight: number) => {
    if (!linkedBatchRatios || linkedBatchRatios.weightPerLength <= 0) {
      setForm({ ...form, totalWeight })
      return
    }
    const totalLength = Number((totalWeight / linkedBatchRatios.weightPerLength).toFixed(6))
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight,
    })
  }

  const handleReceive = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${id}/receive`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '收货成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '收货失败')
      }
    } catch (err) {
      onMessage('收货失败')
    }
    setLoading(false)
  }

  const handleEdit = (item: MaterialIn) => {
    if (item.status !== 'PENDING') {
      onMessage('只有待收货来料单可以修改')
      return
    }

    setMaterials((current) => current.some((material) => material.id === item.material.id)
      ? current
      : [...current, item.material])
    setEditingItem(item)
    setDraftItems([])
    setLinkedBatchRatios(null)
    setForm({
      voucherNo: item.voucherNo || '',
      supplierId: item.supplierId,
      materialId: item.materialId,
      locationId: item.locationId || locations.find((location) => location.isDefault)?.id || '',
      qty: item.material.primaryMeasure === 'LENGTH' ? 0 : Number(item.qty),
      pieceCount: Number(item.pieceCount || 0),
      stockQtyMode: item.stockQtyMode || 'TOTAL',
      stockQtyInput: Number(item.stockQtyInput ?? item.qty),
      totalLength: Number(item.totalLength ?? (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)),
      totalWeight: Number(item.totalWeight ?? (item.material.referenceMeasure === 'WEIGHT' ? item.valuationQty : item.material.primaryMeasure === 'WEIGHT' ? item.qty : 0)),
      unitPrice: Number(item.unitPrice),
      priceUnit: normalizeMaterialInPriceUnit(item.priceUnit, item.material.primaryMeasure),
      totalAmount: Number(item.totalAmount),
      priceInputMode: 'TOTAL',
      batchNo: item.batchNo || '',
      receivedBy: item.receivedBy || '',
      note: item.note || '',
    })
    setShowModal(true)
  }

  const handleReject = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${id}/reject`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '拒收成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '拒收失败')
      }
    } catch (err) {
      onMessage('拒收失败')
    }
    setLoading(false)
  }

  const handleReverse = async (item: MaterialIn) => {
    const reason = window.prompt(`请输入红冲来料单 ${item.inboundNo} 的原因`)
    if (!reason) return

    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${item.id}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '红冲成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '红冲失败')
      }
    } catch (err) {
      onMessage('红冲失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.materialIns"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索来料单号、物料、供应商或批次"
          />
        )}
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            <AppButton
              variant="create"
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
            >
              新建来料单
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, onToolbarChange, keyword, selectedStatuses, selectedCustomerId, selectedSupplierId, customers, suppliers, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.materialIns"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索来料单号、物料、供应商或批次"
            />
          )}
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              <AppButton
                variant="create"
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
              >
                新建来料单
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-3 sm:p-6">
        {materialIns.length === 0 ? (
          <div className="text-center py-8 text-gray-500 sm:py-12">
            <p className="text-4xl mb-4">📦</p>
            <p>暂无来料单</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {materialInSort.sortedRows.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.inboundNo}</div>
                    <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(item.inboundDate).toLocaleString('zh-CN')}</div>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                    {statusLabels[item.status] || item.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 sm:mt-4">
                  <div>
                    <div className="text-xs text-gray-500">供应商</div>
                    <div className="mt-1 font-medium text-gray-900">{item.supplier?.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">物料</div>
                    <div className="mt-1 font-medium text-gray-900">{item.material?.name}</div>
                    <div className="text-xs text-gray-500">{item.material?.code} · 客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                    <div className="mt-1 text-xs text-blue-700">库位：{item.location ? `${item.location.code} · ${item.location.name}` : '默认库位'}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4 sm:mt-4 sm:gap-3">
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">库存数量</div>
                    <div className="mt-1 font-semibold">{item.qty} {item.unit}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {item.pieceCount || 0} 件 · {item.totalLength || (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)} m · {item.totalWeight || 0} kg
                    </div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">核算数量</div>
                    <div className="mt-1 font-semibold text-green-700">{item.valuationQty} {item.valuationUnit}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">单价</div>
                    <div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(4)}</div>
                    <div className="text-[11px] text-gray-500">/{displayPriceUnit(item.priceUnit || item.valuationUnit)}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">金额</div>
                    <div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  批次：{item.batchNo || '-'} · 1 {item.unit} = {item.conversionRate} {item.valuationUnit}
                  · {item.conversionSource === 'DOCUMENT_ACTUAL' ? '本批实测换算' : '物料默认换算'}
                  · 按 {displayPriceUnit(item.priceUnit || item.valuationUnit)} 计价
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    <BusinessDocumentPrintLink kind="material-in" id={item.id} />
                    {item.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleEdit(item)}
                          disabled={loading}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleReceive(item.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                        >
                          收货
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                        >
                          拒收
                        </button>
                      </>
                    )}
                    {item.status === 'RECEIVED' && (
                      <button
                        onClick={() => handleReverse(item)}
                        disabled={loading}
                        className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 transition disabled:opacity-50"
                      >
                        红冲
                      </button>
                    )}
                    {item.status !== 'PENDING' && item.status !== 'RECEIVED' && (
                      <span className="text-xs text-gray-400">无操作</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
              <thead className="bg-gray-50">
                <tr>
                  <SortableTableHeader column="inboundNo" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>入库单号</SortableTableHeader>
                  <SortableTableHeader column="voucherNo" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>凭据号</SortableTableHeader>
                  <SortableTableHeader column="supplier" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>供应商</SortableTableHeader>
                  <SortableTableHeader column="material" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>物料</SortableTableHeader>
                  <SortableTableHeader column="location" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>收货库位</SortableTableHeader>
                  <SortableTableHeader column="qty" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>库存数量</SortableTableHeader>
                  <SortableTableHeader column="valuationQty" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>核算数量</SortableTableHeader>
                  <SortableTableHeader column="unitPrice" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>报价单价</SortableTableHeader>
                  <SortableTableHeader column="valuationUnitCost" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>每核算单位成本</SortableTableHeader>
                  <SortableTableHeader column="stockUnitCost" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>每库存单位成本</SortableTableHeader>
                  <SortableTableHeader column="totalAmount" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>总金额</SortableTableHeader>
                  <SortableTableHeader column="batchNo" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>批次</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>状态</SortableTableHeader>
                  <SortableTableHeader column="inboundDate" activeColumn={materialInSort.sortColumn} direction={materialInSort.sortDirection} onSort={materialInSort.toggleSort}>入库日期</SortableTableHeader>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialInSort.sortedRows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.inboundNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.supplier?.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.material?.name}</div>
                      <div className="text-xs text-gray-500">{item.material?.code}</div>
                      <div className="text-xs text-gray-500">客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.location ? <><div>{item.location.name}</div><div className="font-mono text-xs text-gray-500">{item.location.code}</div></> : '默认库位'}</td>
                    <td className="px-4 py-3">
                      <div>{item.qty} {item.unit}</div>
                      <div className="text-xs text-gray-500">
                        {item.pieceCount || 0} 件 · {item.totalLength || (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)} m · {item.totalWeight || 0} kg
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.valuationQty} {item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">1 {item.unit} = {item.conversionRate} {item.valuationUnit}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>¥{item.unitPrice.toFixed(4)} / {displayPriceUnit(item.priceUnit || item.valuationUnit)}</div>
                      <div className="text-xs text-gray-500">按 {displayPriceUnit(item.priceUnit || item.valuationUnit)} 计价</div>
                    </td>
                    <td className="px-4 py-3">¥{(item.valuationUnitCost || item.unitPrice).toFixed(4)} / {item.valuationUnit}</td>
                    <td className="px-4 py-3">¥{item.stockUnitCost.toFixed(4)} / {item.unit}</td>
                    <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{item.batchNo || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.inboundDate).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <BusinessDocumentPrintLink kind="material-in" id={item.id} compact />
                        {item.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleEdit(item)}
                              disabled={loading}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleReceive(item.id)}
                              disabled={loading}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                            >
                              收货
                            </button>
                            <button
                              onClick={() => handleReject(item.id)}
                              disabled={loading}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                            >
                              拒收
                            </button>
                          </>
                        )}
                        {item.status === 'RECEIVED' && (
                          <button
                            onClick={() => handleReverse(item)}
                            disabled={loading}
                            className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 transition disabled:opacity-50"
                          >
                            红冲
                          </button>
                        )}
                        {item.status !== 'PENDING' && item.status !== 'RECEIVED' && (
                          <span className="text-xs text-gray-400">无操作</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ModalDialog
          title={editingItem ? `编辑来料单 ${editingItem.inboundNo}` : '新建来料单'}
          description={editingItem ? '修改当前来料明细。' : '一张来料单可添加多种物料，每种物料分别记录数量、计价和库位。'}
          onClose={() => { setShowModal(false); resetForm() }}
          closeDisabled={loading}
          size="wide"
          overlayClassName="z-[60]"
          panelClassName="!max-w-[min(96vw,1500px)]"
          bodyClassName="xl:overflow-hidden"
          footer={(
            <ModalActions
              onCancel={() => { setShowModal(false); resetForm() }}
              onConfirm={handleSubmit}
              confirmLabel={editingItem ? '保存并输出 PDF' : `创建 ${draftItems.length + (form.materialId ? 1 : 0)} 项并输出 PDF`}
              busy={loading}
            />
          )}
        >
          <div className={`min-h-0 ${editingItem ? '' : 'xl:grid xl:h-full xl:grid-cols-[minmax(0,1fr)_20rem]'}`}>
            <div className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-3 xl:gap-4 ${editingItem ? '' : 'xl:min-h-0 xl:overflow-y-auto xl:pr-5'}`}>
              <div className="lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
                <input
                  type="text"
                  value={form.voucherNo}
                  onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  placeholder="外部单号、纸质单号或客户/供应商单号"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">供应商</label>
                <SupplierSearchSelect
                  value={form.supplierId}
                  options={suppliers}
                  onChange={(supplier) => setForm((current) => ({ ...current, supplierId: supplier?.id || '' }))}
                  onSearch={fetchSuppliers}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">物料</label>
                <MaterialSearchSelect
                  value={form.materialId}
                  options={materials}
                  onChange={updateSelectedMaterial}
                  onSearch={fetchMaterials}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="mb-2 block text-sm font-medium text-gray-700">收货库位</label>
                <SearchableSelect
                  value={form.locationId}
                  onChange={(locationId) => setForm({ ...form, locationId })}
                  options={locations.map((location) => ({
                    value: location.id,
                    label: `${location.code} · ${location.name}${location.isDefault ? '（默认）' : ''}`,
                  }))}
                  placeholder="输入库位编码或名称筛选"
                />
              </div>
              {selectedMaterial && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 lg:col-span-7">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">来料实测</div>
                      <div className="mt-0.5 text-xs text-gray-500">数量、长度和重量分别记录；库存只按物料主库存单位入账。</div>
                    </div>
                    {isLengthMaterial && (
                      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                        {([
                          ['TOTAL', '总长度'],
                          ['PER_PIECE', '单件长度'],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setLinkedBatchRatios(null)
                              setForm({ ...form, stockQtyMode: value })
                            }}
                            className={`rounded-md px-3 py-1.5 text-sm ${form.stockQtyMode === value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        数量（件）{(isLengthMaterial || selectedMaterial.primaryMeasure === 'QUANTITY') ? ' *' : ''}
                      </label>
                      <input
                        type="number"
                        step="1"
                        min={0}
                        value={form.pieceCount || ''}
                        onChange={(event) => updateLinkedPieceCount(Math.max(0, Math.floor(Number(event.target.value))))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {isLengthMaterial && form.stockQtyMode === 'PER_PIECE' ? '单件长度' : '总长度'}（m）{isLengthMaterial ? ' *' : ''}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={(isLengthMaterial ? form.stockQtyInput : form.totalLength) || ''}
                        onChange={(event) => {
                          const value = Math.max(0, Number(event.target.value))
                          if (!isLengthMaterial) setForm({ ...form, totalLength: value })
                          else if (form.stockQtyMode === 'TOTAL') updateLinkedTotalLength(value)
                          else setForm({ ...form, stockQtyInput: value })
                        }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        总重量（kg）{selectedMaterial.primaryMeasure === 'WEIGHT' ? ' *' : ''}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={form.totalWeight || ''}
                        onChange={(event) => updateLinkedTotalWeight(Math.max(0, Number(event.target.value)))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {selectedMaterial.primaryMeasure === 'OTHER' && (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-medium text-gray-700">主单位总量（{stockUnitLabel}）*</label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={form.qty || ''}
                        onChange={(event) => setForm({ ...form, qty: Math.max(0, Number(event.target.value)) })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <div className="mt-3 rounded bg-white px-3 py-2 text-sm text-blue-900">
                    库存入账：<strong>{calculatedStockQty} {stockUnitLabel}</strong>
                    {isLengthMaterial && form.stockQtyMode === 'PER_PIECE' && (
                      <span className="ml-2 text-xs text-gray-500">= {form.pieceCount || 0} 件 × {form.stockQtyInput || 0} m</span>
                    )}
                    <div className="mt-1 text-xs text-gray-500">
                      实测快照：{form.pieceCount || 0} 件 · {calculatedTotalLength || 0} m · {form.totalWeight || 0} kg
                    </div>
                    {materialUsesDualUnit && (
                      <div className="mt-1 text-xs text-gray-500">
                        核算数量：{effectiveValuationQty} {valuationUnitLabel}{actualReferenceQty > 0 ? '（本批实测）' : `（默认换算 ${referenceValuationQty}）`}
                      </div>
                    )}
                  </div>
                  {isLengthMaterial && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-3">
                      <div className="text-xs text-gray-600">
                        {linkedBatchRatios
                          ? `已锁定本批比例：${linkedBatchRatios.lengthPerPiece.toFixed(6)} m/件，${linkedBatchRatios.weightPerLength.toFixed(6)} kg/m`
                          : '填完数量、总长度和总重量后，可锁定本批比例进行三值联动。'}
                      </div>
                      <button
                        type="button"
                        onClick={toggleBatchLink}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${linkedBatchRatios ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-700'}`}
                      >
                        {linkedBatchRatios ? '关闭比例联动' : '开启比例联动'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className={`space-y-4 ${selectedMaterial ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
                <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3">
                  <div className="text-sm font-medium text-gray-800">采购计价</div>
                  <div className="mt-0.5 text-xs text-gray-500">单价或总价格任选一个修改，系统按所选计价单位自动换算另一项。</div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">单价</label>
                    <div className="flex rounded-lg border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={unitPricePreview || ''}
                        onChange={(event) => setForm({
                          ...form,
                          unitPrice: Math.max(0, Number(event.target.value)),
                          priceInputMode: 'UNIT',
                        })}
                        className="min-w-0 flex-1 rounded-l-lg px-4 py-2 outline-none"
                      />
                      <select
                        aria-label="单价计量单位"
                        value={form.priceUnit}
                        onChange={(event) => setForm({ ...form, priceUnit: event.target.value as MaterialInPriceUnit })}
                        className="w-24 border-l border-gray-200 bg-gray-50 px-2 text-sm outline-none"
                      >
                        <option value="m">元 / 米</option>
                        <option value="kg">元 / kg</option>
                        <option value="件">元 / 件</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">总价格（元）</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={totalAmountPreview || ''}
                      onChange={(event) => setForm({
                        ...form,
                        totalAmount: Math.max(0, Number(event.target.value)),
                        priceInputMode: 'TOTAL',
                      })}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-blue-50 p-4 text-sm text-blue-900 sm:grid-cols-2">
                  <div>计价数量：{priceQuantity || 0} {displayPriceUnit(form.priceUnit)}</div>
                  <div>单价：¥{unitPricePreview.toFixed(4)} / {displayPriceUnit(form.priceUnit)}</div>
                  <div>总价格：¥{totalAmountPreview.toFixed(2)}</div>
                  <div>主库存单位成本：¥{stockUnitCostPreview.toFixed(4)} / {stockUnitLabel}</div>
                  {materialUsesDualUnit && (
                    <>
                      <div>核算单位成本：¥{valuationUnitCostPreview.toFixed(4)} / {valuationUnitLabel}</div>
                      <div>本批实际换算：{actualConversionRate || 0} {valuationUnitLabel} / {stockUnitLabel}</div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:col-span-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">批次号</label>
                  <input
                    type="text"
                    value={form.batchNo}
                    onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">收货人</label>
                  <input
                    type="text"
                    value={form.receivedBy}
                    onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="lg:col-span-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {!editingItem && selectedMaterial && (
                <div className="flex justify-end lg:col-span-12">
                  <AppButton variant="secondary" onClick={addCurrentItem}>添加本项并继续</AppButton>
                </div>
              )}
            </div>
            {!editingItem && (
              <aside className="mt-5 border-t border-gray-200 pt-5 xl:mt-0 xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white pb-3">
                  <div className="text-sm font-semibold text-gray-900">本单已加入</div>
                  <div className="text-xs tabular-nums text-gray-500">{draftItems.length} 项</div>
                </div>
                {draftItems.length === 0 ? (
                  <div className="border-y border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                    暂无已加入物料
                  </div>
                ) : (
                  <div className="border-t border-gray-200">
                    {draftItems.map((item, index) => {
                      const material = materials.find((option) => option.id === item.materialId)
                      const location = locations.find((option) => option.id === item.locationId)
                      return (
                        <div key={item.id} className="border-b border-gray-100 py-3 text-sm">
                          <div className="flex items-start gap-2">
                            <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="break-words font-medium text-gray-900">
                                {material ? formatMaterialLabel(material) : item.materialId}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {item.qty} {item.unit} · ¥{item.totalAmount.toFixed(2)}
                              </div>
                              <div className="mt-0.5 break-words text-xs text-gray-500">
                                {location ? `${location.code} · ${location.name}` : item.locationId}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraftItems((current) => current.filter((draft) => draft.id !== item.id))}
                              className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              移除
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm">
                      <span className="text-gray-500">已加入合计</span>
                      <strong className="tabular-nums text-gray-900">
                        ¥{draftItems.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>
        </ModalDialog>
      )}
      </div>
    </>
  )
}
