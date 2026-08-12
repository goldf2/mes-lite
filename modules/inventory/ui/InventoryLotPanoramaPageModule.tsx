'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import type { InventoryLotPanorama, InventoryLotPanoramaEdge, InventoryLotSearchResult } from '../contracts/inventory-lot-panorama'
import type { InventoryLotTraceNode } from '../contracts/inventory-lot-trace'
import { loadInventoryLotPanorama, searchInventoryLots } from '../client/inventory-lot-api'
import { inventoryStatusLabel } from '../domain/inventory-status'
import InventoryLotTraceDialog from './InventoryLotTraceDialog'

const emptySearch: InventoryLotSearchResult = { keyword: '', items: [], truncated: false }
const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')

function sourceLabel(lot: InventoryLotTraceNode) {
  if (lot.sourceDocument.type === 'MATERIAL_IN') return `来料 ${lot.sourceDocument.number} · ${lot.sourceDocument.supplier || '未知供应商'}`
  if (lot.sourceDocument.type === 'PRODUCTION_ORDER_ACTUAL_OUTPUT') return `生产 ${lot.sourceDocument.actualNo} · 工单 ${lot.sourceDocument.productionOrder}`
  if (lot.sourceDocument.type === 'RETURN_ORDER') return `退货 ${lot.sourceDocument.number} · 原发货 ${lot.sourceDocument.shipmentNo || '-'}`
  if (lot.sourceDocument.type === 'LEGACY_INVENTORY') return '历史未追踪库存（兼容批次）'
  if (lot.sourceDocument.type === 'LEGACY_SHIPMENT') return `历史发货 ${lot.sourceDocument.number}（兼容批次）`
  return `${lot.sourceType} · ${lot.sourceDocument.number}`
}

function generationLabel(generation: number) {
  if (generation === 0) return '当前批次'
  return generation < 0 ? `上游第 ${Math.abs(generation)} 层` : `下游第 ${generation} 层`
}

function relationLabel(edge: InventoryLotPanoramaEdge, direction: 'in' | 'out') {
  if (edge.type === 'CUSTOMER_RETURN') {
    return `${direction === 'in' ? '由客户退回' : '客户退货回流'} · ${edge.documentNo} · ${edge.customer || '未知客户'} · ${numberText(edge.stockQty)}`
  }
  return `${direction === 'in' ? '由生产产出' : '投入下游生产'} · ${edge.documentNo}${edge.secondaryDocumentNo ? ` / ${edge.secondaryDocumentNo}` : ''} · ${numberText(edge.stockQty)}`
}

function LotCard({ lot, active, edges, onTrace }: {
  lot: InventoryLotTraceNode
  active: boolean
  edges: InventoryLotPanoramaEdge[]
  onTrace: (id: string) => void
}) {
  const positiveBalances = lot.balances.filter((item) => item.stockQty > 0.000001)
  const inventoryStatuses = Array.from(new Set((positiveBalances.length > 0 ? positiveBalances : lot.balances).map((item) => inventoryStatusLabel(item.inventoryStatus))))
  const relations = edges.flatMap((edge) => {
    if (edge.targetLotId === lot.id) return [{ id: `in:${edge.type}:${edge.id}`, label: relationLabel(edge, 'in') }]
    if (edge.sourceLotId === lot.id) return [{ id: `out:${edge.type}:${edge.id}`, label: relationLabel(edge, 'out') }]
    return []
  })
  return (
    <article className={`rounded-xl border bg-white p-4 shadow-sm ${active ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-mono text-sm font-semibold text-blue-700">{lot.lotNo}</div><div className="mt-1 text-sm font-medium text-gray-900">{lot.material.code} · {lot.material.name}</div></div>
        {active && <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">追溯起点</span>}
      </div>
      <div className="mt-2 text-xs text-gray-500">{sourceLabel(lot)}</div>
      {lot.supplierLotNo && <div className="mt-1 text-xs text-gray-600">供应批号：<span className="font-mono">{lot.supplierLotNo}</span></div>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(inventoryStatuses.length > 0 ? inventoryStatuses : [lot.status]).map((status) => <span key={status} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{status}</span>)}
        {lot.inspections.map((inspection) => <span key={inspection.inspectionNo} className={`rounded px-2 py-1 text-[11px] ${inspection.result === 'PASS' ? 'bg-emerald-50 text-emerald-700' : inspection.result === 'FAIL' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{inspection.inspectionNo} · {inspection.result === 'PASS' ? '合格' : inspection.result === 'FAIL' ? '不合格' : '待检'}</span>)}
      </div>
      <div className="mt-3 space-y-1 text-xs text-gray-600">
        {positiveBalances.length === 0 ? <div>当前无可用库存余额</div> : positiveBalances.map((balance) => <div key={`${balance.location.id}:${balance.inventoryStatus}`}>余额 {numberText(balance.stockQty)} {lot.material.stockUnit || lot.material.unit} · {balance.location.code}</div>)}
      </div>
      {relations.length > 0 && <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">{relations.map((relation) => <div key={relation.id} className="text-[11px] leading-5 text-gray-500">↳ {relation.label}</div>)}</div>}
      <div className="mt-3"><AppButton size="sm" onClick={() => onTrace(lot.id)}>查看相邻明细</AppButton></div>
    </article>
  )
}

export default function InventoryLotPanoramaPageModule({ onMessage }: { onMessage: (message: string) => void }) {
  const [keyword, setKeyword] = useState('')
  const [searchResult, setSearchResult] = useState(emptySearch)
  const [searching, setSearching] = useState(false)
  const [selectedLotId, setSelectedLotId] = useState('')
  const [panorama, setPanorama] = useState<InventoryLotPanorama | null>(null)
  const [loadingPanorama, setLoadingPanorama] = useState(false)
  const [traceLotId, setTraceLotId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const normalized = keyword.trim()
    if (!normalized) {
      setSearchResult(emptySearch)
      setSelectedLotId('')
      setPanorama(null)
      setSearching(false)
      return () => { active = false }
    }
    setSearchResult(emptySearch)
    setSelectedLotId('')
    setPanorama(null)
    setError('')
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchInventoryLots(normalized)
        .then((result) => { if (active) setSearchResult(result) })
        .catch((requestError) => {
          if (!active) return
          const message = requestError instanceof Error ? requestError.message : '搜索批次失败'
          setError(message)
          onMessage(message)
        })
        .finally(() => { if (active) setSearching(false) })
    }, 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [keyword, onMessage])

  useEffect(() => {
    if (!selectedLotId) return
    let active = true
    setLoadingPanorama(true)
    setError('')
    void loadInventoryLotPanorama(selectedLotId)
      .then((result) => { if (active) setPanorama(result) })
      .catch((requestError) => {
        if (!active) return
        const message = requestError instanceof Error ? requestError.message : '获取批次追溯全景失败'
        setError(message)
        onMessage(message)
      })
      .finally(() => { if (active) setLoadingPanorama(false) })
    return () => { active = false }
  }, [onMessage, selectedLotId])

  const generations = useMemo(() => {
    const groups = new Map<number, InventoryLotPanorama['nodes']>()
    for (const node of panorama?.nodes || []) groups.set(node.generation, [...(groups.get(node.generation) || []), node])
    return Array.from(groups.entries()).sort(([left], [right]) => left - right)
  }, [panorama])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          pageKey="lotPanorama"
          primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.lotPanorama" value={keyword} onChange={setKeyword} placeholder="搜索供应批号、内部批号、供应商、客户或单据号" />}
        />
      </TopBarPortal>
      <section className="space-y-4 rounded-lg bg-white p-3 shadow sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="text-lg font-semibold text-gray-900">批次追溯全景</h2><p className="mt-1 text-sm text-gray-500">从任意业务线索定位内部批次，一次查看供应来料、生产转换、质量、客户发货和退货回流。</p></div>
          <div className="text-xs text-gray-500">单次最多显示 100 条搜索结果、300 个关联批次</div>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!keyword.trim() ? (
          <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-6 py-12 text-center">
            <div className="text-base font-semibold text-gray-900">先输入一个可追溯线索</div>
            <div className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-500">支持供应批号、内部批号、物料、供应商、来料单、生产工单、实绩单、检验单、客户、发货单和退货单。</div>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
            <aside className="rounded-xl border border-gray-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-gray-900">匹配批次 · {searchResult.items.length}</h3>{searchResult.truncated && <span className="text-[11px] text-amber-700">仅显示前 100 条</span>}</div>
              {searching && searchResult.items.length === 0 ? <AppLoadingIndicator compact label="正在搜索批次..." /> : searchResult.items.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">没有找到匹配批次，请检查单据号或批号。</div> : (
                <div className="max-h-[44rem] space-y-2 overflow-y-auto pr-1">
                  {searchResult.items.map((item) => (
                    <button key={item.lot.id} type="button" onClick={() => setSelectedLotId(item.lot.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedLotId === item.lot.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-100' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold text-blue-700">{item.lot.lotNo}</span><span className="text-[11px] text-gray-500">{item.matchedBy.join('、') || '关联信息'}</span></div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{item.lot.material.code} · {item.lot.material.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-gray-500">{sourceLabel(item.lot)}</div>
                      {item.lot.supplierLotNo && <div className="mt-1 text-xs text-gray-600">供应批号 {item.lot.supplierLotNo}</div>}
                    </button>
                  ))}
                </div>
              )}
            </aside>
            <main className="min-w-0">
              {!selectedLotId && <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 text-center text-sm text-gray-500">从左侧选择一个内部批次，系统会自动展开全部上下游关系。</div>}
              {loadingPanorama && <AppLoadingIndicator label="正在展开批次全景..." className="rounded-xl border border-gray-200" />}
              {!loadingPanorama && panorama && <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {[
                    ['关联批次', panorama.summary.lots], ['转换关系', panorama.summary.relations], ['供应批次', panorama.summary.supplierLots], ['客户', panorama.summary.customers], ['质量检验', panorama.summary.qualityInspections],
                  ].map(([label, value]) => <div key={label} className="rounded-lg border border-gray-200 bg-white px-3 py-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-xl font-semibold text-gray-900">{value}</div></div>)}
                </div>
                {panorama.truncated && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">关系规模超过安全上限，当前仅显示最接近起点的 300 个批次。</div>}
                <div className="overflow-x-auto pb-2">
                  <div className="grid min-w-[44rem] auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-3">
                    {generations.map(([generation, nodes]) => <section key={generation} className={`rounded-xl border p-3 ${generation === 0 ? 'border-blue-200 bg-blue-50/60' : 'border-gray-200 bg-slate-50'}`}>
                      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">{generationLabel(generation)}</h3><span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600">{nodes.length} 个批次</span></div>
                      <div className="space-y-3">{nodes.map((node) => <LotCard key={node.lot.id} lot={node.lot} active={node.lot.id === panorama.selectedLotId} edges={panorama.edges} onTrace={setTraceLotId} />)}</div>
                    </section>)}
                  </div>
                </div>
                <section className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">客户发货去向 · {panorama.customerShipments.length}</h3>
                  {panorama.customerShipments.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">全景内批次尚无有效客户发货。</div> : <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{panorama.customerShipments.map((shipment) => {
                    const sourceLot = panorama.nodes.find((node) => node.lot.id === shipment.lotId)?.lot
                    return <div key={shipment.id} className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600"><div className="flex justify-between gap-2"><span className="font-mono font-semibold text-blue-700">{shipment.shipmentNo}</span><span>{shipment.status === 'DELIVERED' ? '已签收' : '已发货'}</span></div><div className="mt-1 font-medium text-gray-900">{shipment.customerCode ? `${shipment.customerCode} · ` : ''}{shipment.customer}</div><div className="mt-1">来自批次 {sourceLot?.lotNo || shipment.lotId}</div><div className="mt-1">发出 {numberText(shipment.stockQty)} · 已退 {numberText(shipment.returnedStockQty)} · {shipment.location.code}</div></div>
                  })}</div>}
                </section>
              </div>}
            </main>
          </div>
        )}
      </section>
      {traceLotId && <InventoryLotTraceDialog lotId={traceLotId} onClose={() => setTraceLotId('')} onMessage={onMessage} />}
    </>
  )
}
