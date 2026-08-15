'use client'

import { useEffect, useMemo, useState } from 'react'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import {
  loadInventoryLocations,
  loadStockCustomers,
  loadStocks,
  repairMissingStockRecords,
  submitStockAdjustment,
} from '../client/stock-api'
import type {
  Customer,
  InventoryLocationOption,
  Stock,
  StockAdjustmentDraft,
  StockIntegrityIssue,
} from '../contracts/stock'
import {
  canBackfillStockIssues,
  createStockAdjustmentDraft,
  materialCategoryLabels,
  materialCategoryFilterOptions,
} from '../model/stock-view'
import { StockAdjustmentDialog, StockAdjustmentHelpDialog } from './StockAdjustmentDialog'
import StockCollectionView from './StockCollectionView'
import StockDetailPanel from './StockDetailPanel'
import StockIntegrityAlert from './StockIntegrityAlert'

interface StockPageModuleProps {
  canUpdateStock: boolean
  onMessage: (message: string) => void
  onStateSummaryChange?: (summary: string) => void
}

const allCategoryValues: string[] = materialCategoryFilterOptions.map((option) => option.value)

export default function StockPageModule({ canUpdateStock, onMessage, onStateSummaryChange }: StockPageModuleProps) {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocationOption[]>([])
  const [stockKeyword, setStockKeyword] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockViewMode, setStockViewMode] = usePersistedViewMode('mes-lite.stocks.viewMode', 'card')
  const [stockCustomerFilter, setStockCustomerFilter] = useState('')
  const [stockLocationFilter, setStockLocationFilter] = useState('')
  const [selectedStockId, setSelectedStockId] = useState('')
  const [selectedStockCategories, setSelectedStockCategories] = useState<string[]>(allCategoryValues)
  const [showInvalidStocks, setShowInvalidStocks] = useState(false)
  const [showStockHelp, setShowStockHelp] = useState(false)
  const [stockDataError, setStockDataError] = useState<{ message: string; issues: StockIntegrityIssue[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState<StockAdjustmentDraft>({ locationId: '', newLocationQty: 0, newValuationQty: 0, newTotalCost: 0, reason: '' })

  const stockAdvancedSearchFields = useMemo(() => [
    {
      key: 'customerId',
      label: '客户',
      value: stockCustomerFilter,
      onChange: setStockCustomerFilter,
      options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: customer.name }))],
    },
    {
      key: 'locationId',
      label: '库位',
      value: stockLocationFilter,
      onChange: setStockLocationFilter,
      options: inventoryLocations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })),
    },
    {
      key: 'stockType',
      label: '库存对象',
      value: stockFilter === 'all' ? '' : stockFilter,
      onChange: (value: string) => setStockFilter(value === 'material' || value === 'product' ? value : 'all'),
      options: [{ value: 'material', label: '物料库存' }, { value: 'product', label: '成品库存' }],
    },
    {
      key: 'category',
      label: '物料分类',
      value: selectedStockCategories.length === 1 ? selectedStockCategories[0] : '',
      onChange: (value: string) => setSelectedStockCategories(value ? [value] : allCategoryValues),
      options: materialCategoryFilterOptions,
    },
    {
      key: 'showInvalid',
      label: '归档无库存',
      value: showInvalidStocks ? 'true' : '',
      onChange: (value: string) => setShowInvalidStocks(value === 'true'),
      options: [{ value: 'true', label: '显示' }],
    },
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
    const categories = (url.searchParams.get('categories') || '').split(',').filter((value) => allCategoryValues.includes(value))
    if (categories.length > 0) setSelectedStockCategories(categories)
    setShowInvalidStocks(url.searchParams.get('invalid') === '1')
    setSelectedStockId(url.searchParams.get('stock') || '')
  }, [setStockViewMode])

  useEffect(() => {
    void fetchStocks()
    // 请求参数就是下面这些筛选状态；函数保持模块内部，避免应用壳持有业务请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockKeyword, selectedStockCategories, stockCustomerFilter, stockLocationFilter, showInvalidStocks])

  useEffect(() => {
    void loadStockCustomers().then(setCustomers).catch(() => undefined)
    void loadInventoryLocations().then(setInventoryLocations).catch(() => undefined)
  }, [])

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
    if (selectedStockCategories.length !== allCategoryValues.length) url.searchParams.set('categories', selectedStockCategories.join(',')); else url.searchParams.delete('categories')
    if (showInvalidStocks) url.searchParams.set('invalid', '1'); else url.searchParams.delete('invalid')
    if (selectedStockId) url.searchParams.set('stock', selectedStockId); else url.searchParams.delete('stock')
    window.history.replaceState(window.history.state, '', url)
  }, [selectedStockCategories, selectedStockId, showInvalidStocks, stockCustomerFilter, stockFilter, stockKeyword, stockLocationFilter, stockViewMode])

  async function fetchStocks(options: { skipAutoBackfill?: boolean } = {}) {
    try {
      const result = await loadStocks({
        keyword: stockKeyword,
        customerId: stockCustomerFilter,
        locationId: stockLocationFilter,
        categories: selectedStockCategories,
        allCategories: materialCategoryFilterOptions,
        includeInvalid: showInvalidStocks,
      })
      if (!result.ok) {
        if (result.status === 409 && !options.skipAutoBackfill && canUpdateStock && canBackfillStockIssues(result.issues)) {
          const repaired = await repairStockRecords({ refetch: false, silent: true })
          if (repaired) {
            onMessage('库存余额已自动补齐')
            await fetchStocks({ skipAutoBackfill: true })
            return
          }
        }
        setStocks([])
        setStockDataError({ message: result.error, issues: result.issues })
        onMessage(result.error)
        return
      }
      setStockDataError(null)
      setStocks(result.data)
    } catch {
      setStocks([])
      setStockDataError({ message: '库存数据异常', issues: [] })
      onMessage('库存数据异常')
    }
  }

  async function repairStockRecords(options: { refetch?: boolean; silent?: boolean } = {}) {
    setLoading(true)
    try {
      const result = await repairMissingStockRecords()
      if (!result.ok) {
        if (!options.silent) onMessage(result.message)
        return false
      }
      if (!options.silent) onMessage(result.message)
      if (options.refetch ?? true) await fetchStocks({ skipAutoBackfill: true })
      return true
    } catch {
      if (!options.silent) onMessage('补齐库存余额失败')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function openStockAdjust(stock: Stock, preferredLocationId?: string) {
    let locations = inventoryLocations
    if (locations.length === 0) {
      try {
        locations = await loadInventoryLocations()
        setInventoryLocations(locations)
      } catch {
        locations = []
      }
    }
    if (locations.length === 0) {
      onMessage('请先在“配置 → 库位配置”中建立启用库位')
      return
    }
    const location = locations.find((item) => item.id === preferredLocationId)
      || stock.locationBalances.find((balance) => Number(balance.qty) > 0 && locations.some((item) => item.id === balance.locationId))?.location
      || locations.find((item) => item.isDefault)
      || locations[0]
    setAdjustingStock(stock)
    setStockAdjustForm(createStockAdjustmentDraft(stock, location.id))
  }

  async function saveStockAdjustment() {
    if (!adjustingStock) return
    if (!stockAdjustForm.locationId) return onMessage('请选择本次调整对应的库位')
    if (!stockAdjustForm.reason.trim()) return onMessage('请输入存货调整原因')
    setLoading(true)
    try {
      const result = await submitStockAdjustment({
        ...stockAdjustForm,
        stockId: adjustingStock.id,
        newLocationQty: Number(stockAdjustForm.newLocationQty),
        newValuationQty: Number(stockAdjustForm.newValuationQty),
        newTotalCost: Number(stockAdjustForm.newTotalCost),
        reason: stockAdjustForm.reason.trim(),
      })
      if (!result.ok) return onMessage(result.message)
      onMessage(result.message)
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
    quarantineQty: (stock) => stock.quarantineQty,
    holdQty: (stock) => stock.holdQty,
    valuationQty: (stock) => stock.valuationQty,
    totalCost: (stock) => stock.totalCost,
  }, 'object', 'asc')
  const selectedStock = stockSort.sortedRows.find((stock) => stock.id === selectedStockId) || stockSort.sortedRows[0] || null

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

      <div className="rounded-lg bg-white p-3 shadow sm:p-6">
        {stockDataError && (
          <StockIntegrityAlert
            message={stockDataError.message}
            issues={stockDataError.issues}
            canRepair={canUpdateStock}
            repairing={loading}
            onRepair={() => void repairStockRecords()}
          />
        )}
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <StockCollectionView
            viewMode={stockViewMode}
            sort={stockSort}
            selectedStockId={selectedStock?.id}
            canAdjust={canUpdateStock}
            onSelect={setSelectedStockId}
            onAdjust={(stock) => void openStockAdjust(stock)}
          />
          {selectedStock && <StockDetailPanel stock={selectedStock} canAdjust={canUpdateStock} onAdjust={(stock, locationId) => void openStockAdjust(stock, locationId)} />}
        </div>
      </div>

      {adjustingStock && (
        <StockAdjustmentDialog
          stock={adjustingStock}
          locations={inventoryLocations}
          value={stockAdjustForm}
          busy={loading}
          onChange={setStockAdjustForm}
          onClose={() => setAdjustingStock(null)}
          onSubmit={() => void saveStockAdjustment()}
        />
      )}
      {showStockHelp && <StockAdjustmentHelpDialog onClose={() => setShowStockHelp(false)} />}
    </>
  )
}
