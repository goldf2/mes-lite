'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { resourceAdvancedFields, type ResourceSearchCondition } from '@/lib/resource-search'
import { loadStockMovements, type StockMovementRequest } from '../client/stock-movement-api'
import type { StockMovementWorkspace } from '../contracts/stock-movement'
import StockMovementCollectionView from './StockMovementCollectionView'
import { buildStockMovementSearchCatalog } from '../model/inventory-search-fields'

const emptyWorkspace: StockMovementWorkspace = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  options: { types: [], refTypes: [], locations: [] },
}

export default function StockMovementPageModule({ onMessage }: { onMessage: (message: string) => void }) {
  const [workspace, setWorkspace] = useState<StockMovementWorkspace>(emptyWorkspace)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.stockMovements.viewMode', 'list')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }
  const query = useMemo<StockMovementRequest>(() => ({
    keyword,
    page,
    pageSize,
    type: '', direction: '', objectCode: '', objectName: '', locationId: '', refType: '', refId: '', operator: '', note: '', createdDate: '',
    advancedConditions: searchConditions,
  }), [keyword, page, pageSize, searchConditions])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void loadStockMovements(query)
        .then((result) => {
          if (!active) return
          setWorkspace(result)
          if (result.pagination.total > 0 && result.pagination.page > Math.max(1, result.pagination.totalPages)) {
            setPage(Math.max(1, result.pagination.totalPages))
          }
        })
        .catch((requestError) => {
          if (!active) return
          const message = requestError instanceof Error ? requestError.message : '获取库存流水失败'
          setError(message)
          onMessage(message)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [onMessage, query])

  const searchCatalog = useMemo(() => buildStockMovementSearchCatalog(workspace.options), [workspace.options])
  const advancedSearchFields = useMemo(() => resourceAdvancedFields(searchCatalog), [searchCatalog])
  const filterCount = searchConditions.length

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          pageKey="stockMovements"
          primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.stockMovements" value={keyword} onChange={updateFilter(setKeyword)} placeholder="搜索物料、流水类型、来源、库位或人员" conditions={searchConditions} onConditionsChange={(conditions) => { setSearchConditions(conditions); setPage(1) }} />}
          advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={searchConditions} onChange={(conditions) => { setSearchConditions(conditions); setPage(1) }} />}
          filterCount={filterCount}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        />
      </TopBarPortal>

      <section className="rounded-lg bg-white p-3 shadow sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-semibold text-gray-900">库存流水</h2><p className="mt-1 text-sm text-gray-500">按时间追踪入库、耗用、发货、退货、转移、调整和冲销，并核对库存与成本前后值。</p></div>
          <div className="text-sm text-gray-500">共 {workspace.pagination.total} 条流水{filterCount > 0 ? ` · ${filterCount} 个精确条件` : ''}</div>
        </div>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && workspace.items.length === 0 ? <AppLoadingIndicator label="正在读取库存流水..." /> : (
          <StockMovementCollectionView
            items={workspace.items}
            viewMode={viewMode}
            pagination={workspace.pagination}
            onPageChange={setPage}
            onPageSizeChange={(value) => { setPageSize(value); setPage(1) }}
          />
        )}
      </section>
    </>
  )
}
