'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SearchableSelect from '@/app/components/SearchableSelect'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import { getMultiSelectQuery } from '@/app/components/StatusCheckboxFilter'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'

interface Customer {
  id: string
  code: string
  name: string
}

interface InventoryLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
  isActive: boolean
}

interface StockLocationBalance {
  id: string
  locationId: string
  qty: number
  reservedQty: number
  availableQty: number
  location: InventoryLocationOption
}

interface PackagingMaterialRef {
  id: string
  code: string
  name: string
  category: string
  stockUnit: string
}

interface PackagingDefinition {
  bom: { id: string; name: string; version: string }
  outputQuantity: number
  outputUnit: string
  contents: Array<{ material: PackagingMaterialRef; quantity: number }>
}

interface PackagingInventorySource {
  stockId: string
  material: PackagingMaterialRef
  qty: number
  equivalentQty: number
  ratio: number
  bom: { id: string; name: string; version: string }
  locations: Array<{ locationId: string; code: string; name: string; qty: number; equivalentQty: number }>
}

interface PackagingInventorySummary {
  material: PackagingMaterialRef
  packagedEquivalentQty: number
  sources: PackagingInventorySource[]
}

interface Stock {
  id: string
  qty: number
  reservedQty: number
  availableQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  totalCost: number
  valuationUnitCost: number
  stockUnitCost: number
  locationBalances: StockLocationBalance[]
  packagingDefinition?: PackagingDefinition | null
  packagingSummary?: PackagingInventorySummary | null
  material?: { id: string; code: string; name: string; spec: string; category?: string; customerId?: string | null; customer?: Customer | null; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number; deletedAt?: string | null; primaryImage?: { id: string; url: string; thumbnailUrl?: string; displayUrl?: string; originalUrl?: string; note?: string | null; mimeType: string; isCover: boolean } | null }
  product?: { id: string; sku: string; name: string; category: string; customerId?: string | null; customer?: Customer | null; unit: string }
}

interface StockIntegrityIssue {
  type?: string
  message?: string
  records?: Array<{ id?: string; code?: string; reasons?: string[] }>
}

interface StockPageModuleProps {
  operatorName: string
  canUpdateStock: boolean
  onMessage: (message: string) => void
  onStateSummaryChange?: (summary: string) => void
}

const repairableStockIssueTypes = new Set(['MATERIAL_WITHOUT_STOCK', 'PRODUCT_WITHOUT_STOCK'])

function canBackfillStockIssues(issues: StockIntegrityIssue[]) {
  return issues.length > 0 && issues.every((issue) => Boolean(issue.type && repairableStockIssueTypes.has(issue.type)))
}

function stockQuantityText(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料',
  DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他',
}

const materialCategoryOptions = [
  ['RAW', '原材料'], ['FINISHED', '成品'], ['AUXILIARY', '辅材'], ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'], ['PACKAGING', '包装物'], ['OTHER', '其他'],
] as const

const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

export default function StockPageModule({ operatorName, canUpdateStock, onMessage, onStateSummaryChange }: StockPageModuleProps) {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stockKeyword, setStockKeyword] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockViewMode, setStockViewMode] = usePersistedViewMode('mes-lite.stocks.viewMode', 'card')
  const [stockCustomerFilter, setStockCustomerFilter] = useState('')
  const [stockLocationFilter, setStockLocationFilter] = useState('')
  const [selectedStockId, setSelectedStockId] = useState('')
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocationOption[]>([])
  const [selectedStockCategories, setSelectedStockCategories] = useState<string[]>(materialCategoryFilterOptions.map((option) => option.value))
  const [showInvalidStocks, setShowInvalidStocks] = useState(false)
  const [showStockHelp, setShowStockHelp] = useState(false)
  const [stockDataError, setStockDataError] = useState<{ message: string; issues: StockIntegrityIssue[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState({ locationId: '', newLocationQty: 0, newValuationQty: 0, newTotalCost: 0, reason: '' })

  const stockAdvancedSearchFields = useMemo(() => [
    { key: 'customerId', label: '客户', value: stockCustomerFilter, onChange: setStockCustomerFilter, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: customer.name }))] },
    { key: 'locationId', label: '库位', value: stockLocationFilter, onChange: setStockLocationFilter, options: inventoryLocations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })) },
    { key: 'stockType', label: '库存对象', value: stockFilter === 'all' ? '' : stockFilter, onChange: (value: string) => setStockFilter(value === 'material' || value === 'product' ? value : 'all'), options: [{ value: 'material', label: '物料库存' }, { value: 'product', label: '成品库存' }] },
    { key: 'category', label: '物料分类', value: selectedStockCategories.length === 1 ? selectedStockCategories[0] : '', onChange: (value: string) => setSelectedStockCategories(value ? [value] : materialCategoryFilterOptions.map((option) => option.value)), options: materialCategoryFilterOptions },
    { key: 'showInvalid', label: '归档无库存', value: showInvalidStocks ? 'true' : '', onChange: (value: string) => setShowInvalidStocks(value === 'true'), options: [{ value: 'true', label: '显示' }] },
  ], [customers, inventoryLocations, selectedStockCategories, showInvalidStocks, stockCustomerFilter, stockFilter, stockLocationFilter])

  useEffect(() => {
    const url = new URL(window.location.href)
    const requestedView = url.searchParams.get('view')
    if (requestedView === 'card' || requestedView === 'list') setStockViewMode(requestedView)
    setStockKeyword(url.searchParams.get('q') || '')
    const requestedStockType = url.searchParams.get('stockType')
    if (requestedStockType === 'material' || requestedStockType === 'product') setStockFilter(requestedStockType)
    setStockCustomerFilter(url.searchParams.get('customer') || '')
    setStockLocationFilter(url.searchParams.get('location') || '')
    const categories = (url.searchParams.get('categories') || '').split(',').filter((value) => materialCategoryFilterOptions.some((option) => option.value === value))
    if (categories.length > 0) setSelectedStockCategories(categories)
    setShowInvalidStocks(url.searchParams.get('invalid') === '1')
    setSelectedStockId(url.searchParams.get('stock') || '')
  }, [setStockViewMode])

  useEffect(() => {
    void fetchStocks()
    void fetchCustomers()
    void fetchInventoryLocations()
    // 请求参数就是下面这些筛选状态；函数保持模块内部，避免应用壳持有业务请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockKeyword, selectedStockCategories, stockCustomerFilter, stockLocationFilter, showInvalidStocks])

  useEffect(() => {
    onStateSummaryChange?.(`视图：${stockViewMode === 'card' ? '卡片' : '列表'} · 类型：${stockFilter}`)
  }, [onStateSummaryChange, stockFilter, stockViewMode])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', stockViewMode)
    if (stockKeyword.trim()) url.searchParams.set('q', stockKeyword.trim()); else url.searchParams.delete('q')
    if (stockFilter !== 'all') url.searchParams.set('stockType', stockFilter); else url.searchParams.delete('stockType')
    if (stockCustomerFilter) url.searchParams.set('customer', stockCustomerFilter); else url.searchParams.delete('customer')
    if (stockLocationFilter) url.searchParams.set('location', stockLocationFilter); else url.searchParams.delete('location')
    if (selectedStockCategories.length !== materialCategoryFilterOptions.length) url.searchParams.set('categories', selectedStockCategories.join(',')); else url.searchParams.delete('categories')
    if (showInvalidStocks) url.searchParams.set('invalid', '1'); else url.searchParams.delete('invalid')
    if (selectedStockId) url.searchParams.set('stock', selectedStockId); else url.searchParams.delete('stock')
    window.history.replaceState(window.history.state, '', url)
  }, [selectedStockCategories, selectedStockId, showInvalidStocks, stockCustomerFilter, stockFilter, stockKeyword, stockLocationFilter, stockViewMode])

  async function fetchStocks(options: { skipAutoBackfill?: boolean } = {}) {
    const params = new URLSearchParams()
    if (stockKeyword.trim()) params.set('keyword', stockKeyword.trim())
    if (stockCustomerFilter) params.set('customerId', stockCustomerFilter)
    if (stockLocationFilter) params.set('locationId', stockLocationFilter)
    const categoryQuery = getMultiSelectQuery('categories', selectedStockCategories, materialCategoryFilterOptions)
    if (categoryQuery) new URLSearchParams(categoryQuery).forEach((value, key) => params.set(key, value))
    if (showInvalidStocks) params.set('includeInvalid', '1')
    const response = await fetch(`/api/stocks${params.toString() ? `?${params.toString()}` : ''}`)
    const payload = await response.json()
    if (!response.ok) {
      const issues = Array.isArray(payload.issues) ? payload.issues : []
      if (response.status === 409 && !options.skipAutoBackfill && canUpdateStock && canBackfillStockIssues(issues)) {
        const repaired = await repairStockRecords({ refetch: false, silent: true })
        if (repaired) {
          onMessage('库存余额已自动补齐')
          await fetchStocks({ skipAutoBackfill: true })
          return
        }
      }
      setStocks([])
      setStockDataError({ message: payload.error || '库存数据异常', issues })
      onMessage(payload.error || '库存数据异常')
      return
    }
    setStockDataError(null)
    setStocks(payload.data || [])
  }

  async function repairStockRecords(options: { refetch?: boolean; silent?: boolean } = {}) {
    setLoading(true)
    try {
      const response = await fetch('/api/stocks', { method: 'PATCH' })
      const payload = await response.json()
      if (!response.ok) {
        if (!options.silent) onMessage(payload.error || '补齐库存余额失败')
        return false
      }
      if (!options.silent) onMessage(payload.message || '库存余额已补齐')
      if (options.refetch ?? true) await fetchStocks({ skipAutoBackfill: true })
      return true
    } catch {
      if (!options.silent) onMessage('补齐库存余额失败')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function fetchCustomers() {
    try {
      const response = await fetch('/api/customers')
      if (response.ok) setCustomers((await response.json()).data || [])
    } catch {
      // 客户选项不可用不阻断库存主列表。
    }
  }

  async function fetchInventoryLocations() {
    try {
      const response = await fetch('/api/inventory-locations')
      if (response.ok) {
        const locations = ((await response.json()).data || []) as InventoryLocationOption[]
        setInventoryLocations(locations)
        return locations
      }
    } catch {
      // 库位加载失败时由调整弹窗阻止提交并提示。
    }
    return [] as InventoryLocationOption[]
  }

  async function openStockAdjust(stock: Stock, preferredLocationId?: string) {
    const locations = inventoryLocations.length > 0 ? inventoryLocations : await fetchInventoryLocations()
    if (locations.length === 0) {
      onMessage('请先在“配置 → 库位配置”中建立启用库位')
      return
    }
    const location = locations.find((item) => item.id === preferredLocationId)
      || stock.locationBalances.find((balance) => Number(balance.qty) > 0 && locations.some((item) => item.id === balance.locationId))?.location
      || locations.find((item) => item.isDefault)
      || locations[0]
    const locationBalance = stock.locationBalances.find((balance) => balance.locationId === location.id)
    setAdjustingStock(stock)
    setStockAdjustForm({ locationId: location.id, newLocationQty: Number(locationBalance?.qty || 0), newValuationQty: Number(stock.valuationQty || 0), newTotalCost: Number(stock.totalCost || 0), reason: '' })
  }

  async function submitStockAdjust() {
    if (!adjustingStock) return
    if (!stockAdjustForm.locationId) return onMessage('请选择本次调整对应的库位')
    if (!stockAdjustForm.reason.trim()) return onMessage('请输入存货调整原因')
    setLoading(true)
    try {
      const response = await fetch('/api/stocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: adjustingStock.id, locationId: stockAdjustForm.locationId, newLocationQty: Number(stockAdjustForm.newLocationQty), newValuationQty: Number(stockAdjustForm.newValuationQty), newTotalCost: Number(stockAdjustForm.newTotalCost), reason: stockAdjustForm.reason.trim(), adjustedBy: operatorName }),
      })
      const payload = await response.json()
      if (!response.ok) return onMessage(payload.error || '存货调整失败')
      onMessage(payload.message || '存货调整完成')
      setAdjustingStock(null)
      await fetchStocks()
    } catch {
      onMessage('存货调整失败')
    } finally {
      setLoading(false)
    }
  }

  const visibleStocks = stocks.filter((stock) => stockFilter === 'all' ? true : stockFilter === 'material' ? !!stock.material : !!stock.product)
  const stockSort = useClientTableSort(visibleStocks, {
    object: (stock) => `${stock.material?.code || stock.product?.sku || ''} ${stock.material?.name || stock.product?.name || ''}`,
    customer: (stock) => stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定',
    type: (stock) => stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品',
    qty: (stock) => stock.qty,
    reservedQty: (stock) => stock.reservedQty,
    availableQty: (stock) => stock.availableQty,
    valuationQty: (stock) => stock.valuationQty,
    totalCost: (stock) => stock.totalCost,
  }, 'object', 'asc')
  const selectedStock = stockSort.sortedRows.find((stock) => stock.id === selectedStockId) || stockSort.sortedRows[0] || null
  const selectedStockLocations = selectedStock?.locationBalances.filter((balance) => Math.abs(Number(balance.qty)) > 0.000001 || Math.abs(Number(balance.reservedQty)) > 0.000001) || []
  const canUpdate = (_resource?: string) => canUpdateStock
  const showMessage = onMessage
  const tab = 'stocks'

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          pageKey="stocks"
          primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.stocks" value={stockKeyword} onChange={setStockKeyword} placeholder="搜索物料或编码" />}
          advancedSearch={<MappedResourceAdvancedSearch fields={stockAdvancedSearchFields} />}
          viewControl={<ViewModeToggle value={stockViewMode} onChange={setStockViewMode} />}
          actions={<button onClick={() => setShowStockHelp(true)} className="shrink-0 whitespace-nowrap rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 sm:px-4 sm:py-2 sm:text-sm">调整</button>}
        />
      </TopBarPortal>

        {tab === 'stocks' && (
          <div className="bg-white rounded-lg shadow p-3 sm:p-6">
            {stockDataError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="font-semibold">{stockDataError.message}</div>
                    <div className="mt-1 text-xs text-red-700">库存页已停止展示可能不完整的数据，请先处理以下一致性问题。</div>
                  </div>
                  {canUpdate('stocks') && canBackfillStockIssues(stockDataError.issues) && (
                    <button
                      type="button"
                      onClick={() => repairStockRecords()}
                      disabled={loading}
                      className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-fit"
                    >
                      {loading ? '修复中...' : '补齐库存余额'}
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {stockDataError.issues.map((issue, index) => (
                    <div key={`${issue.type || index}-${index}`} className="rounded border border-red-100 bg-white/70 p-2">
                      <div className="font-medium">{issue.message || issue.type}</div>
                      <div className="mt-1 space-y-1 text-xs text-red-700">
                        {(issue.records || []).length > 0 ? (issue.records || []).map((record: any) => (
                          <div key={record.id || record.code}>
                            <span className="font-medium">{record.code || record.id}</span>
                            {record.reasons?.length ? `：${record.reasons.join('；')}` : ''}
                          </div>
                        )) : '无明细'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">
            {stockViewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>
                      <SortableTableHeader column="object" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存对象</SortableTableHeader>
                      <SortableTableHeader column="customer" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>客户</SortableTableHeader>
                      <SortableTableHeader column="type" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>类型</SortableTableHeader>
                      <SortableTableHeader column="qty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存</SortableTableHeader>
                      <SortableTableHeader column="reservedQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>已预留</SortableTableHeader>
                      <SortableTableHeader column="availableQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>可用</SortableTableHeader>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库位</th>
                      <SortableTableHeader column="valuationQty" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>核算库存</SortableTableHeader>
                      <SortableTableHeader column="totalCost" activeColumn={stockSort.sortColumn} direction={stockSort.sortDirection} onSort={stockSort.toggleSort}>库存金额</SortableTableHeader>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockSort.sortedRows.map((stock) => {
                      const occupiedLocations = stock.locationBalances.filter((balance) => Math.abs(Number(balance.qty)) > 0.000001)
                      const stockUnit = stock.material?.stockUnit || stock.product?.unit || ''
                      return (
                      <tr
                        key={stock.id}
                        onClick={() => setSelectedStockId(stock.id)}
                        className={`cursor-pointer transition ${selectedStock?.id === stock.id ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-3">
                          {stock.material?.primaryImage ? (
                            <a
                              href={stock.material.primaryImage.originalUrl || stock.material.primaryImage.url}
                              target="_blank"
                              rel="noreferrer"
                              title={stock.material.primaryImage.note || '查看物料图片'}
                              className="block h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={stock.material.primaryImage.thumbnailUrl || stock.material.primaryImage.url} alt={stock.material.primaryImage.note || stock.material.name} className="h-full w-full object-cover" />
                            </a>
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
                              无图
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{stock.material?.name || stock.product?.name}</div>
                          <div className="text-xs text-gray-500">{stock.material?.code || stock.product?.sku}</div>
                          {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品'}
                            </span>
                            {stock.material?.deletedAt && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">已归档</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>{stockQuantityText(stock.qty)} {stockUnit}</div>
                          {stock.packagingSummary && (
                            <div className="mt-1 text-xs font-medium text-emerald-700">
                              穿透 {stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {stockUnit}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-orange-600">{stock.reservedQty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className={`px-4 py-3 text-sm font-medium ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty} {stock.material?.stockUnit || stock.product?.unit}</td>
                        <td className="px-4 py-3 text-xs">
                          {occupiedLocations.length > 0 ? (
                            <div className="space-y-1">
                              {occupiedLocations.slice(0, 2).map((balance) => (
                                <div key={balance.id} className="flex max-w-44 justify-between gap-2 text-gray-600">
                                  <span className="truncate" title={`${balance.location.code} · ${balance.location.name}`}>{balance.location.code}</span>
                                  <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {stockUnit}</span>
                                </div>
                              ))}
                              {occupiedLocations.length > 2 && <div className="text-blue-600">另有 {occupiedLocations.length - 2} 个库位</div>}
                            </div>
                          ) : <span className="text-gray-400">无库位库存</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {stock.material ? `${stock.valuationQty} ${stock.material.valuationUnit}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {stock.material ? `¥${Number(stock.totalCost || 0).toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {canUpdate('stocks') && (
                            <button
                              onClick={() => openStockAdjust(stock)}
                              className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                            >
                              存货调整
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stockSort.sortedRows.map((stock) => {
                  const occupiedLocations = stock.locationBalances.filter((balance) => Math.abs(Number(balance.qty)) > 0.000001)
                  const stockUnit = stock.material?.stockUnit || stock.product?.unit || ''
                  return (
                  <div
                    key={stock.id}
                    onClick={() => setSelectedStockId(stock.id)}
                    className={`cursor-pointer border rounded-lg p-4 transition ${selectedStock?.id === stock.id ? 'border-blue-400 bg-blue-50/40 shadow-sm' : 'border-gray-200 hover:shadow-md'}`}
                  >
	                  <div className="flex items-start justify-between mb-3">
	                    <div className="flex min-w-0 items-start gap-3">
                        {stock.material?.primaryImage ? (
                          <a
                            href={stock.material.primaryImage.originalUrl || stock.material.primaryImage.url}
                            target="_blank"
                            rel="noreferrer"
                            title={stock.material.primaryImage.note || '查看物料图片'}
                            className="block h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={stock.material.primaryImage.thumbnailUrl || stock.material.primaryImage.url} alt={stock.material.primaryImage.note || stock.material.name} className="h-full w-full object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
                            无图
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-800">{stock.material?.name || stock.product?.name}</div>
                          <div className="text-sm text-gray-500">{stock.material?.code || stock.product?.sku}</div>
                          <div className="text-xs text-gray-400">
                            客户：{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}
                          </div>
                          {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                        </div>
	                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品'}
                      </div>
                      {stock.material?.deletedAt && (
                        <div className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          已归档
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">库存</div>
                      <div className="text-lg font-semibold">{stockQuantityText(stock.qty)}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">已预留</div>
                      <div className="text-lg font-semibold text-orange-600">{stock.reservedQty}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">可用</div>
                      <div className={`text-lg font-semibold ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stock.availableQty}</div>
                      <div className="text-[11px] text-gray-500">{stock.material?.stockUnit || stock.product?.unit}</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">库位库存</span>
                      <span className="text-gray-400">{occupiedLocations.length} 个库位</span>
                    </div>
                    {occupiedLocations.length > 0 ? (
                      <div className="space-y-1.5">
                        {occupiedLocations.slice(0, 3).map((balance) => (
                          <div key={balance.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-gray-500" title={`${balance.location.code} · ${balance.location.name}`}>
                              {balance.location.code} · {balance.location.name}
                            </span>
                            <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {stockUnit}</span>
                          </div>
                        ))}
                        {occupiedLocations.length > 3 && <div className="text-xs text-blue-600">另有 {occupiedLocations.length - 3} 个库位，点击查看</div>}
                      </div>
                    ) : <div className="text-xs text-gray-400">当前没有库位库存</div>}
                  </div>
                  {stock.packagingSummary && (
                    <div className="mt-3 border-t border-emerald-100 pt-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-emerald-800">包装穿透合计</span>
                        <span className="font-semibold text-emerald-800">
                          {stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {stockUnit}
                        </span>
                      </div>
                      <div className="mt-1 text-gray-500">散装 {stockQuantityText(stock.qty)} + 包装等效 {stockQuantityText(stock.packagingSummary.packagedEquivalentQty)}</div>
                    </div>
                  )}
                  {stock.material && (
                    <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                      <div>核算库存：<span className="font-semibold text-gray-900">{stock.valuationQty}</span> {stock.material.valuationUnit}</div>
                      <div className="mt-1">库存金额：<span className="font-semibold text-gray-900">¥{Number(stock.totalCost || 0).toFixed(2)}</span></div>
                      <div className="mt-1">
                        成本：¥{Number(stock.valuationUnitCost || 0).toFixed(4)} / {stock.material.valuationUnit}
                        <span className="ml-2">¥{Number(stock.stockUnitCost || 0).toFixed(4)} / {stock.material.stockUnit || stock.material.unit}</span>
                      </div>
                      <div className="mt-1">
                        当前实际换算：1 {stock.material.stockUnit || stock.material.unit} = {Number(stock.qty) > 0 ? (Number(stock.valuationQty) / Number(stock.qty)).toFixed(6) : '-'} {stock.material.valuationUnit}
                      </div>
                      <div className="mt-1 text-gray-500">物料默认换算：1 {stock.material.stockUnit || stock.material.unit} = {stock.material.conversionRate || 1} {stock.material.valuationUnit}</div>
                    </div>
                  )}
                  {canUpdate('stocks') && (
                    <button
                      onClick={() => openStockAdjust(stock)}
                      className="mt-3 w-full px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50"
                    >
                      存货调整
                    </button>
                  )}
                </div>
              )})}
              </div>
            )}
            {visibleStocks.length === 0 && (
              <div className="py-12 text-center text-gray-500">暂无库存记录</div>
            )}
              </div>
              {selectedStock && (
                <aside className="min-w-0 border-t border-gray-200 pt-5 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{selectedStock.material?.name || selectedStock.product?.name}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">{selectedStock.material?.code || selectedStock.product?.sku}{selectedStock.material?.spec ? ` · ${selectedStock.material.spec}` : ''}</div>
                    </div>
                    {canUpdate('stocks') && (
                      <button
                        type="button"
                        onClick={() => openStockAdjust(selectedStock)}
                        className="shrink-0 rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        调整
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-3 text-center">
                    <div>
                      <div className="text-[11px] text-gray-500">总库存</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{stockQuantityText(selectedStock.qty)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">预留</div>
                      <div className="mt-1 text-sm font-semibold text-orange-600">{stockQuantityText(selectedStock.reservedQty)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">可用</div>
                      <div className="mt-1 text-sm font-semibold text-emerald-700">{stockQuantityText(selectedStock.availableQty)}</div>
                    </div>
                  </div>

                  <section className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">库位明细</h3>
                      <span className="text-xs text-gray-400">{selectedStockLocations.length} 个有库存库位</span>
                    </div>
                    {selectedStockLocations.length > 0 ? (
                      <div className="divide-y divide-gray-100 border-y border-gray-100">
                        {selectedStockLocations.map((balance) => (
                          <div key={balance.id} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-gray-800">{balance.location.code} · {balance.location.name}</div>
                                <div className="mt-1 text-[11px] text-gray-500">
                                  预留 {stockQuantityText(balance.reservedQty)} · 可用 {stockQuantityText(balance.availableQty)}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold text-gray-900">{stockQuantityText(balance.qty)} {selectedStock.material?.stockUnit || selectedStock.product?.unit}</div>
                                {canUpdate('stocks') && (
                                  <button
                                    type="button"
                                    onClick={() => openStockAdjust(selectedStock, balance.locationId)}
                                    className="mt-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    调整此库位
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-y border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">当前没有库位库存</div>
                    )}
                  </section>

                  {selectedStock.packagingDefinition && (
                    <section className="mt-5 border-t border-amber-100 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-amber-900">包装 BOM</h3>
                        <span className="text-xs text-amber-700">{selectedStock.packagingDefinition.bom.version}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{selectedStock.packagingDefinition.bom.name}</div>
                      <div className="mt-2 space-y-1.5">
                        {selectedStock.packagingDefinition.contents.map((content) => (
                          <div key={content.material.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-gray-600">{content.material.code} · {content.material.name}</span>
                            <span className="shrink-0 font-medium text-gray-900">
                              {stockQuantityText(content.quantity)} {content.material.stockUnit} / {stockQuantityText(selectedStock.packagingDefinition!.outputQuantity)} {selectedStock.packagingDefinition!.outputUnit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectedStock.packagingSummary && (
                    <section className="mt-5 border-t border-emerald-100 pt-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-emerald-900">包装穿透</h3>
                          <div className="mt-1 text-xs text-gray-500">散装与包装库存等效汇总</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-800">
                            {stockQuantityText(Number(selectedStock.qty) + Number(selectedStock.packagingSummary.packagedEquivalentQty))}
                          </div>
                          <div className="text-[11px] text-gray-500">{selectedStock.material?.stockUnit || selectedStock.product?.unit}</div>
                        </div>
                      </div>
                      <div className="mt-3 divide-y divide-emerald-100 border-y border-emerald-100">
                        <div className="flex justify-between gap-3 py-2 text-xs">
                          <span className="text-gray-600">散装实际库存</span>
                          <span className="font-medium text-gray-900">{stockQuantityText(selectedStock.qty)} {selectedStock.material?.stockUnit}</span>
                        </div>
                        {selectedStock.packagingSummary.sources.map((source) => (
                          <div key={source.stockId} className="py-2.5 text-xs">
                            <div className="flex justify-between gap-3">
                              <span className="min-w-0 truncate text-gray-700">{source.material.code} · {source.material.name}</span>
                              <span className="shrink-0 font-medium text-emerald-800">等效 {stockQuantityText(source.equivalentQty)} {selectedStock.material?.stockUnit}</span>
                            </div>
                            <div className="mt-1 text-gray-500">实际 {stockQuantityText(source.qty)} {source.material.stockUnit} · {source.bom.name} {source.bom.version}</div>
                            {source.locations.map((location) => (
                              <div key={location.locationId} className="mt-1 flex justify-between gap-3 pl-2 text-[11px] text-gray-500">
                                <span className="truncate">{location.code} · {location.name}</span>
                                <span className="shrink-0">{stockQuantityText(location.qty)} {source.material.stockUnit} → {stockQuantityText(location.equivalentQty)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </aside>
              )}
            </div>
          </div>
        )}

        {adjustingStock && (
          <ModalDialog
            title="存货调整"
            description={`${adjustingStock.material?.name || adjustingStock.product?.name} · ${adjustingStock.material?.code || adjustingStock.product?.sku}`}
            onClose={() => setAdjustingStock(null)}
            closeDisabled={loading}
            footer={(
              <ModalActions
                onCancel={() => setAdjustingStock(null)}
                onConfirm={submitStockAdjust}
                confirmLabel="确认调整"
                busy={loading}
              />
            )}
          >
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  调整只作用于所选库位，并同步更新物料总库存。用于期初录入、盘点差异、损耗和早期数据尾差修正；来料单整单冲销仍使用“红冲”。
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">调整库位</label>
                  <SearchableSelect
                    value={stockAdjustForm.locationId}
                    onChange={(locationId) => {
                      const balance = adjustingStock.locationBalances.find((item) => item.locationId === locationId)
                      setStockAdjustForm({
                        ...stockAdjustForm,
                        locationId,
                        newLocationQty: Number(balance?.qty || 0),
                      })
                    }}
                    options={inventoryLocations.map((location) => {
                      const balance = adjustingStock.locationBalances.find((item) => item.locationId === location.id)
                      return {
                        value: location.id,
                        label: `${location.code} · ${location.name}（当前 ${Number(balance?.qty || 0)} ${adjustingStock.material?.stockUnit || adjustingStock.product?.unit}）`,
                      }
                    })}
                    placeholder="输入库位编码或名称筛选"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      调整后库位库存 {adjustingStock.material ? `(${adjustingStock.material.stockUnit || adjustingStock.material.unit})` : `(${adjustingStock.product?.unit || ''})`}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={stockAdjustForm.newLocationQty || ''}
                      onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newLocationQty: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      调整后核算库存 {adjustingStock.material ? `(${adjustingStock.material.valuationUnit})` : ''}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={stockAdjustForm.newValuationQty || ''}
                      onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newValuationQty: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  调整后物料总库存：{
                    Number((
                      Number(adjustingStock.qty)
                      - Number(adjustingStock.locationBalances.find((item) => item.locationId === stockAdjustForm.locationId)?.qty || 0)
                      + Number(stockAdjustForm.newLocationQty || 0)
                    ).toFixed(6))
                  } {adjustingStock.material?.stockUnit || adjustingStock.product?.unit}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">调整后库存金额</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={stockAdjustForm.newTotalCost || ''}
                    onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, newTotalCost: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">调整原因</label>
                  <textarea
                    rows={3}
                    value={stockAdjustForm.reason}
                    onChange={(e) => setStockAdjustForm({ ...stockAdjustForm, reason: e.target.value })}
                    placeholder="例如：期初录入、早期数据成本尾差调整、盘点损耗、称重误差"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
          </ModalDialog>
        )}

        {showStockHelp && (
          <ModalDialog
            title="存货调整说明"
            onClose={() => setShowStockHelp(false)}
            footer={<AppButton variant="primary" onClick={() => setShowStockHelp(false)}>知道了</AppButton>}
          >
              <div className="space-y-3 text-sm text-gray-600">
                <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
                  先建立物料，系统会自动生成 0 库存记录；再回到库存页，在对应库存卡片中点击“存货调整”，填写调整后数量、核算重量、库存金额和原因。
                </div>
                <p>存货调整统一覆盖期初录入、盘点差异、损耗、早期数据尾差和初始化库存。所有调整都会写入操作日志，不做物理删除。</p>
                <p>已经有来料单、领料、红冲等业务单据时，优先使用对应业务单据；存货调整只处理非单据型差异。</p>
              </div>
          </ModalDialog>
        )}

        {/* 物料与 BOM */}
    </>
  )
}
