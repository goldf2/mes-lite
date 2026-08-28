'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, RefreshCcw, Search, Warehouse } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { loadWarehouseDigitalTwin } from '../client/warehouse-digital-twin-api'
import type { WarehouseDigitalTwin } from '../model/warehouse-digital-twin'
import WarehouseTwinCanvas from './WarehouseTwinCanvas'
import WarehouseTwinDetailPanel from './WarehouseTwinDetailPanel'

const emptyTwin: WarehouseDigitalTwin = {
  locations: [], occupiedLocationCount: 0, materialLineCount: 0,
  statusLocationCounts: { EMPTY: 0, AVAILABLE: 0, QUARANTINE: 0, HOLD: 0, REWORK: 0 },
  integrityIssueTypeCount: 0,
}

export default function WarehouseDigitalTwinPageModule({
  onMessage,
  onOpenStocks,
}: {
  onMessage: (message: string) => void
  onOpenStocks: () => void
}) {
  const [twin, setTwin] = useState(emptyTwin)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draftKeyword, setDraftKeyword] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await loadWarehouseDigitalTwin()
      setTwin(data)
      setSelectedLocationId((current) => (
        data.locations.some((location) => location.id === current)
          ? current
          : data.locations.find((location) => location.materials.length > 0)?.id || data.locations[0]?.id || ''
      ))
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '获取仓库数字孪生失败'
      setError(message)
      onMessage(message)
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void reload() }, [reload])

  const selectedLocation = useMemo(() => (
    twin.locations.find((location) => location.id === selectedLocationId) || null
  ), [selectedLocationId, twin.locations])

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault()
    setKeyword(draftKeyword.trim())
  }

  return (
    <div className="min-w-0 space-y-4 p-4 lg:p-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Warehouse size={18} /> 数字孪生仓库 MVP</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">库存空间白板</h2>
          <p className="mt-1 text-sm text-slate-500">使用现有库存、库位和状态事实生成只读空间视图，不建立第二套库存账。</p>
        </div>
        <form className="flex min-w-0 flex-1 gap-2 xl:max-w-2xl" onSubmit={submitSearch}>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <Search size={18} className="shrink-0 text-slate-400" />
            <input
              value={draftKeyword}
              onChange={(event) => setDraftKeyword(event.target.value)}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="输入物料、规格或库位，按回车搜索"
            />
          </label>
          <AppButton variant="primary" type="submit">搜索</AppButton>
          {keyword && <AppButton onClick={() => { setDraftKeyword(''); setKeyword('') }}>清除</AppButton>}
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">授权库位</div><div className="mt-1 text-2xl font-semibold text-slate-950">{twin.locations.length}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">有库存库位</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{twin.occupiedLocationCount}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">物料分布行</div><div className="mt-1 text-2xl font-semibold text-blue-700">{twin.materialLineCount}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">待检 / 冻结</div><div className="mt-1 text-2xl font-semibold text-amber-700">{twin.statusLocationCounts.QUARANTINE} / {twin.statusLocationCounts.HOLD}</div></div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <div><div className="text-xs text-slate-500">空库位</div><div className="mt-1 text-2xl font-semibold text-slate-600">{twin.statusLocationCounts.EMPTY}</div></div>
          <AppButton size="icon" aria-label="刷新库存白板" onClick={() => void reload()}><RefreshCcw size={17} /></AppButton>
        </div>
      </section>

      {twin.integrityIssueTypeCount > 0 && !error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          检测到 {twin.integrityIssueTypeCount} 类库存完整性问题；当前白板按库位余额只读展示，库存过账前仍需在“数据维护与关系检查”中完成处理。
        </div>
      )}

      {loading && twin.locations.length === 0 ? <AppLoadingIndicator label="正在生成仓库白板..." /> : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      ) : twin.locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-500"><Boxes className="mx-auto mb-3" />当前权限范围内没有可展示的库位</div>
      ) : (
        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <WarehouseTwinCanvas
            locations={twin.locations}
            keyword={keyword}
            selectedLocationId={selectedLocationId}
            onSelectLocation={setSelectedLocationId}
          />
          <WarehouseTwinDetailPanel location={selectedLocation} onOpenStocks={onOpenStocks} />
        </section>
      )}
    </div>
  )
}
