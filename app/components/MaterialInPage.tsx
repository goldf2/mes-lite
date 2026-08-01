'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

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
  qty: number
  unit: string
  pieceCount?: number | null
  stockQtyMode: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number | null
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
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MaterialIn | null>(null)
  const [linkedBatchRatios, setLinkedBatchRatios] = useState<{ lengthPerPiece: number; weightPerLength: number } | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materialIn.viewMode', 'list')

  const [form, setForm] = useState({
    voucherNo: '',
    supplierId: '',
    materialId: '',
    qty: 0,
    pieceCount: 0,
    stockQtyMode: 'TOTAL' as 'TOTAL' | 'PER_PIECE',
    stockQtyInput: 0,
    valuationQty: 0,
    unitPrice: 0,
    priceBasis: 'VALUATION',
    batchNo: '',
    receivedBy: '',
    note: '',
  })

  useEffect(() => {
    fetchMaterialIns()
    fetchSuppliers()
    fetchCustomers()
    fetchMaterials()
  }, [keyword, selectedStatuses, selectedSupplierId, selectedCustomerId])

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

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (res.ok) {
        const data = await res.json()
        setSuppliers(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

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
    const nextStockUnit = material?.stockUnit || material?.unit
    const nextValuationUnit = material?.valuationUnit || material?.unit
    const nextUsesDualUnit = Boolean(material && (nextStockUnit !== nextValuationUnit || Number(material.conversionRate || 1) !== 1))
    setForm((current) => ({
      ...current,
      materialId: material?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      valuationQty: 0,
      priceBasis: nextUsesDualUnit ? current.priceBasis : 'STOCK',
    }))
  }

  const resetForm = () => {
    setEditingItem(null)
    setLinkedBatchRatios(null)
    setForm({
      voucherNo: '',
      supplierId: '',
      materialId: '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      valuationQty: 0,
      unitPrice: 0,
      priceBasis: 'VALUATION',
      batchNo: '',
      receivedBy: '',
      note: '',
    })
  }

  const handleSubmit = async () => {
    if (!form.supplierId || !form.materialId || calculatedStockQty <= 0) {
      onMessage('请选择供应商和物料，并输入有效的主单位数量')
      return
    }
    if (isLengthMaterial && form.pieceCount <= 0) {
      onMessage('长度型物料请填写根数')
      return
    }
    setLoading(true)
    try {
      const selectedMaterial = materials.find((m) => m.id === form.materialId)
      const submitStockUnit = selectedMaterial?.stockUnit || selectedMaterial?.unit || '个'
      const submitValuationUnit = selectedMaterial?.valuationUnit || submitStockUnit
      const submitUsesDualUnit = Boolean(
        selectedMaterial && (submitStockUnit !== submitValuationUnit || Number(selectedMaterial.conversionRate || 1) !== 1)
      )
      const res = await fetch(editingItem ? `/api/material-ins/${editingItem.id}` : '/api/material-ins', {
        method: editingItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
          materialId: form.materialId,
          qty: calculatedStockQty,
          pieceCount: isLengthMaterial ? form.pieceCount : undefined,
          stockQtyMode: isLengthMaterial ? form.stockQtyMode : undefined,
          stockQtyInput: isLengthMaterial ? form.stockQtyInput : undefined,
          unit: submitStockUnit,
          valuationQty: submitUsesDualUnit && form.valuationQty > 0 ? form.valuationQty : undefined,
          valuationUnit: submitValuationUnit,
          unitPrice: form.unitPrice,
          priceBasis: submitUsesDualUnit ? form.priceBasis : 'STOCK',
          batchNo: form.batchNo || undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(editingItem ? `来料单已修改：${data.data.inboundNo}` : `来料单创建成功：${data.data.inboundNo}`)
        setShowModal(false)
        resetForm()
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '创建来料单失败')
      }
    } catch (err) {
      onMessage('创建来料单失败')
    }
    setLoading(false)
  }

  const selectedMaterial = materials.find((material) => material.id === form.materialId)
  const isLengthMaterial = selectedMaterial?.primaryMeasure === 'LENGTH'
  const calculatedStockQty = isLengthMaterial
    ? Number(((form.stockQtyMode === 'PER_PIECE'
      ? Number(form.pieceCount || 0) * Number(form.stockQtyInput || 0)
      : Number(form.stockQtyInput || 0))).toFixed(6))
    : Number(form.qty || 0)
  const referenceValuationQty = selectedMaterial && calculatedStockQty > 0 ? Number((calculatedStockQty * (selectedMaterial.conversionRate || 1)).toFixed(6)) : 0
  const stockUnitLabel = selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
  const valuationUnitLabel = selectedMaterial?.valuationUnit || 'kg'
  const primaryQtyLabel = selectedMaterial?.primaryMeasure === 'LENGTH'
    ? '总长度'
    : selectedMaterial?.primaryMeasure === 'WEIGHT'
      ? '总重量'
      : selectedMaterial?.primaryMeasure === 'QUANTITY'
        ? '总数量'
        : '主单位总量'
  const referenceQtyLabel = selectedMaterial?.referenceMeasure === 'LENGTH'
    ? '总长度'
    : selectedMaterial?.referenceMeasure === 'WEIGHT'
      ? '总重量'
      : selectedMaterial?.referenceMeasure === 'QUANTITY'
        ? '总数量'
        : '参考总量'
  const materialUsesDualUnit = Boolean(selectedMaterial && (stockUnitLabel !== valuationUnitLabel || Number(selectedMaterial.conversionRate || 1) !== 1))
  const previewPriceBasis = materialUsesDualUnit ? form.priceBasis : 'STOCK'
  const effectiveValuationQty = materialUsesDualUnit
    ? (form.valuationQty > 0 ? form.valuationQty : referenceValuationQty)
    : calculatedStockQty
  const actualConversionRate = calculatedStockQty > 0 && effectiveValuationQty > 0 ? Number((effectiveValuationQty / calculatedStockQty).toFixed(6)) : 0
  const totalAmountPreview = Number(((previewPriceBasis === 'STOCK' ? calculatedStockQty : effectiveValuationQty) * form.unitPrice).toFixed(4))
  const valuationUnitCostPreview = effectiveValuationQty > 0 ? Number((totalAmountPreview / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = calculatedStockQty > 0 ? Number((totalAmountPreview / calculatedStockQty).toFixed(6)) : 0
  const valuationPriceDisplay = previewPriceBasis === 'VALUATION' ? form.unitPrice : valuationUnitCostPreview
  const stockPriceDisplay = previewPriceBasis === 'STOCK' ? form.unitPrice : stockUnitCostPreview
  const canLinkLengthWeight = isLengthMaterial
    && selectedMaterial?.referenceMeasure === 'WEIGHT'
    && form.pieceCount > 0
    && calculatedStockQty > 0
    && form.valuationQty > 0

  const toggleBatchLink = () => {
    if (linkedBatchRatios) {
      setLinkedBatchRatios(null)
      return
    }
    if (!canLinkLengthWeight) {
      onMessage('请先填写根数、总长度和总重量，再开启比例联动')
      return
    }
    setLinkedBatchRatios({
      lengthPerPiece: calculatedStockQty / form.pieceCount,
      weightPerLength: form.valuationQty / calculatedStockQty,
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
      valuationQty: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalLength = (totalLength: number) => {
    if (!linkedBatchRatios) {
      setForm({ ...form, stockQtyInput: totalLength })
      return
    }
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      valuationQty: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalWeight = (totalWeight: number) => {
    if (!linkedBatchRatios || linkedBatchRatios.weightPerLength <= 0) {
      setForm({ ...form, valuationQty: totalWeight })
      return
    }
    const totalLength = Number((totalWeight / linkedBatchRatios.weightPerLength).toFixed(6))
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      valuationQty: totalWeight,
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
    setLinkedBatchRatios(null)
    setForm({
      voucherNo: item.voucherNo || '',
      supplierId: item.supplierId,
      materialId: item.materialId,
      qty: item.material.primaryMeasure === 'LENGTH' ? 0 : Number(item.qty),
      pieceCount: Number(item.pieceCount || 0),
      stockQtyMode: item.stockQtyMode || 'TOTAL',
      stockQtyInput: Number(item.stockQtyInput ?? item.qty),
      valuationQty: Number(item.valuationQty),
      unitPrice: Number(item.unitPrice),
      priceBasis: item.priceBasis || 'VALUATION',
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
        filters={(
          <>
            <StatusCheckboxFilter
              options={statusOptions}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
              storageKey="mes-lite.filters.materialIn.status.order"
            />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部客户</option>
              <option value="__UNASSIGNED__">通用/未绑定</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </>
        )}
        actions={(
          <>
            <div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <button
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
            >
              新增
            </button>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, keyword, selectedStatuses, selectedCustomerId, selectedSupplierId, customers, suppliers, viewMode, setViewMode])

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
          filters={(
            <>
              <StatusCheckboxFilter
                options={statusOptions}
                value={selectedStatuses}
                onChange={setSelectedStatuses}
                storageKey="mes-lite.filters.materialIn.status.order"
              />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部客户</option>
                <option value="__UNASSIGNED__">通用/未绑定</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </>
          )}
          actions={(
            <>
              <div>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
              <button
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                新增
              </button>
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
            {materialIns.map((item) => (
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
                    <div className="text-xs text-gray-500">{item.supplier?.code}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">物料</div>
                    <div className="mt-1 font-medium text-gray-900">{item.material?.name}</div>
                    <div className="text-xs text-gray-500">{item.material?.code} · 客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4 sm:mt-4 sm:gap-3">
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">库存数量</div>
                    <div className="mt-1 font-semibold">{item.qty} {item.unit}</div>
                    {item.pieceCount ? <div className="mt-0.5 text-xs text-gray-500">{item.pieceCount} 根 · {item.stockQtyMode === 'PER_PIECE' ? `单根 ${item.stockQtyInput} ${item.unit}` : '按总长度录入'}</div> : null}
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">核算数量</div>
                    <div className="mt-1 font-semibold text-green-700">{item.valuationQty} {item.valuationUnit}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">单价</div>
                    <div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(4)}</div>
                    <div className="text-[11px] text-gray-500">/{item.priceUnit || item.valuationUnit}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">金额</div>
                    <div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  批次：{item.batchNo || '-'} · 1 {item.unit} = {item.conversionRate} {item.valuationUnit}
                  · {item.conversionSource === 'DOCUMENT_ACTUAL' ? '本批实测换算' : '物料默认换算'}
                  · {item.priceBasis === 'STOCK' ? '按数量/长度报价' : '按重量报价'}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">入库单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">凭据号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">供应商</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">核算数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">报价单价</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">每kg成本</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">每库存单位成本</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">总金额</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">批次</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">入库日期</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialIns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.inboundNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.supplier?.name}</div>
                      <div className="text-xs text-gray-500">{item.supplier?.code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.material?.name}</div>
                      <div className="text-xs text-gray-500">{item.material?.code}</div>
                      <div className="text-xs text-gray-500">客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.qty} {item.unit}</div>
                      {item.pieceCount ? <div className="text-xs text-gray-500">{item.pieceCount} 根 · {item.stockQtyMode === 'PER_PIECE' ? `单根 ${item.stockQtyInput} ${item.unit}` : '总长度'}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.valuationQty} {item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">1 {item.unit} = {item.conversionRate} {item.valuationUnit}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>¥{item.unitPrice.toFixed(4)} / {item.priceUnit || item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">{item.priceBasis === 'STOCK' ? '按数量/长度报价' : '按重量报价'}</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingItem ? `编辑来料单 ${editingItem.inboundNo}` : '新增来料单'}</h3>
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
                <input
                  type="text"
                  value={form.voucherNo}
                  onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  placeholder="外部单号、纸质单号或客户/供应商单号"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">供应商</label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择供应商</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物料</label>
                <MaterialSearchSelect
                  value={form.materialId}
                  options={materials}
                  onChange={updateSelectedMaterial}
                  onSearch={fetchMaterials}
                />
              </div>
              {isLengthMaterial && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">长度入库</div>
                      <div className="mt-0.5 text-xs text-gray-500">不同长度混批用总长度；同长多根可按单根长度自动相乘。</div>
                    </div>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                      {([
                        ['TOTAL', '总长度'],
                        ['PER_PIECE', '单根长度'],
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
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">根数 *</label>
                      <input
                        type="number"
                        step="1"
                        min={1}
                        value={form.pieceCount || ''}
                        onChange={(event) => updateLinkedPieceCount(Math.max(0, Math.floor(Number(event.target.value))))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {form.stockQtyMode === 'TOTAL' ? '总长度' : '单根长度'} ({stockUnitLabel}) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={form.stockQtyInput || ''}
                        onChange={(event) => {
                          const value = Math.max(0, Number(event.target.value))
                          if (form.stockQtyMode === 'TOTAL') updateLinkedTotalLength(value)
                          else setForm({ ...form, stockQtyInput: value })
                        }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mt-3 rounded bg-white px-3 py-2 text-sm text-blue-900">
                    入库主数量：<strong>{calculatedStockQty} {stockUnitLabel}</strong>
                    {form.stockQtyMode === 'PER_PIECE' && (
                      <span className="ml-2 text-xs text-gray-500">= {form.pieceCount || 0} 根 × {form.stockQtyInput || 0} {stockUnitLabel}</span>
                    )}
                  </div>
                  {selectedMaterial?.referenceMeasure === 'WEIGHT' && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-3">
                      <div className="text-xs text-gray-600">
                        {linkedBatchRatios
                          ? `已锁定本批比例：${linkedBatchRatios.lengthPerPiece.toFixed(6)} ${stockUnitLabel}/根，${linkedBatchRatios.weightPerLength.toFixed(6)} ${valuationUnitLabel}/${stockUnitLabel}`
                          : '填完根数、总长度和总重量后，可锁定本批比例进行三值联动。'}
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
              <div className={`grid gap-4 ${materialUsesDualUnit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {!isLengthMaterial && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">{primaryQtyLabel} {selectedMaterial ? `(${selectedMaterial.stockUnit || selectedMaterial.unit})` : ''}</label>
                    <input
                      type="number"
                      value={form.qty || ''}
                      onChange={(event) => setForm({ ...form, qty: Number(event.target.value) })}
                      min={0}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {materialUsesDualUnit && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{referenceQtyLabel}（可选）{selectedMaterial ? `(${selectedMaterial.valuationUnit})` : ''}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={form.valuationQty || ''}
                      onChange={(e) => updateLinkedTotalWeight(Math.max(0, Number(e.target.value)))}
                      min={0}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {selectedMaterial && (
                      <p className="mt-1 text-xs text-gray-500">
                        例如填写本批实际总重量。不填时才按物料默认参考换算约为 {referenceValuationQty} {selectedMaterial.valuationUnit}。
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">材料单价</div>
                {materialUsesDualUnit ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">重量单价（元 / {valuationUnitLabel}）</label>
                      <input
                        type="number"
                        step="0.01"
                        value={valuationPriceDisplay || ''}
                        onChange={(e) => setForm({ ...form, priceBasis: 'VALUATION', unitPrice: Number(e.target.value) })}
                        min={0}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          previewPriceBasis === 'VALUATION' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        按重量报价时填写这里，例如供应商按 kg 结算；右侧数量单价由系统换算。
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">数量/长度单价（元 / {stockUnitLabel}）</label>
                      <input
                        type="number"
                        step="0.01"
                        value={stockPriceDisplay || ''}
                        onChange={(e) => setForm({ ...form, priceBasis: 'STOCK', unitPrice: Number(e.target.value) })}
                        min={0}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          previewPriceBasis === 'STOCK' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        按数量或长度报价时填写这里，例如供应商按根、件、米结算；左侧重量单价由系统换算。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">单价（元 / {stockUnitLabel}）</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.unitPrice || ''}
                      onChange={(e) => setForm({ ...form, priceBasis: 'STOCK', unitPrice: Number(e.target.value) })}
                      min={0}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      当前物料未配置参考/计价单位，入库和计价都按主库存单位 {stockUnitLabel} 记录。
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                <div>本次报价依据：{previewPriceBasis === 'STOCK' ? `数量/长度单价，¥${(form.unitPrice || 0).toFixed(4)} / ${stockUnitLabel}` : `重量单价，¥${(form.unitPrice || 0).toFixed(4)} / ${valuationUnitLabel}`}</div>
                {materialUsesDualUnit && (
                  <>
                    <div className="mt-1">换算后重量单价：¥{valuationUnitCostPreview.toFixed(4)} / {valuationUnitLabel}</div>
                    <div className="mt-1">换算后数量/长度单价：¥{stockUnitCostPreview.toFixed(4)} / {stockUnitLabel}</div>
                  </>
                )}
                <div className="mt-1">总金额：¥{totalAmountPreview.toFixed(2)}</div>
                {materialUsesDualUnit && (
                  <div className="mt-1">本批实际换算：{actualConversionRate || 0} {valuationUnitLabel} / {stockUnitLabel}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? '提交中...' : editingItem ? '保存修改' : '提交'}
                </button>
                <button
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
