'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { loadStockMovements, type StockMovementRequest } from '../client/stock-movement-api'
import type { StockMovementWorkspace } from '../contracts/stock-movement'
import StockMovementCollectionView from './StockMovementCollectionView'

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
  const [type, setType] = useState('')
  const [direction, setDirection] = useState('')
  const [objectCode, setObjectCode] = useState('')
  const [objectName, setObjectName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [refType, setRefType] = useState('')
  const [refId, setRefId] = useState('')
  const [operator, setOperator] = useState('')
  const [note, setNote] = useState('')
  const [createdDate, setCreatedDate] = useState('')
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
    type,
    direction,
    objectCode,
    objectName,
    locationId,
    refType,
    refId,
    operator,
    note,
    createdDate,
  }), [createdDate, direction, keyword, locationId, note, objectCode, objectName, operator, page, pageSize, refId, refType, type])

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

  const advancedSearchFields = useMemo(() => [
    { key: 'objectCode', label: '物料编码', value: objectCode, onChange: updateFilter(setObjectCode) },
    { key: 'objectName', label: '物料名称', value: objectName, onChange: updateFilter(setObjectName) },
    { key: 'type', label: '流水类型', value: type, onChange: updateFilter(setType), options: workspace.options.types },
    { key: 'direction', label: '收发方向', value: direction, onChange: updateFilter(setDirection), options: [{ value: 'in', label: '增加库存' }, { value: 'out', label: '减少库存' }] },
    { key: 'locationId', label: '库位', value: locationId, onChange: updateFilter(setLocationId), options: workspace.options.locations },
    { key: 'refType', label: '来源类型', value: refType, onChange: updateFilter(setRefType), options: workspace.options.refTypes },
    { key: 'refId', label: '来源单据 ID', value: refId, onChange: updateFilter(setRefId) },
    { key: 'operator', label: '操作人', value: operator, onChange: updateFilter(setOperator) },
    { key: 'note', label: '备注', value: note, onChange: updateFilter(setNote) },
    { key: 'createdDate', label: '发生日期', type: 'date' as const, value: createdDate, onChange: updateFilter(setCreatedDate) },
  ], [createdDate, direction, locationId, note, objectCode, objectName, operator, refId, refType, type, workspace.options.locations, workspace.options.refTypes, workspace.options.types])
  const filterCount = [type, direction, objectCode, objectName, locationId, refType, refId, operator, note, createdDate].filter(Boolean).length

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          pageKey="stockMovements"
          primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.stockMovements" value={keyword} onChange={updateFilter(setKeyword)} placeholder="搜索物料、流水类型、来源或人员" />}
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
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
