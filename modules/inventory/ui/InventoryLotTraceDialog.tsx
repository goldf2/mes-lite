'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ModalDialog from '@/app/components/ModalDialog'
import type { InventoryLotCustomerReturn, InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from '../contracts/inventory-lot-trace'
import { loadInventoryLotTrace } from '../client/inventory-lot-api'
import { inventoryStatusLabel } from '../domain/inventory-status'

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')

function sourceLabel(lot: InventoryLotTraceNode) {
  if (lot.sourceDocument.type === 'MATERIAL_IN') return `来料 ${lot.sourceDocument.number} · ${lot.sourceDocument.supplier || '未知供应商'}`
  if (lot.sourceDocument.type === 'PRODUCTION_ORDER_ACTUAL_OUTPUT') return `生产 ${lot.sourceDocument.actualNo} · 工单 ${lot.sourceDocument.productionOrder}`
  if (lot.sourceDocument.type === 'RETURN_ORDER') return `退货 ${lot.sourceDocument.number} · 原发货 ${lot.sourceDocument.shipmentNo || '-'} · ${lot.sourceDocument.customer || '未知客户'}`
  if (lot.sourceDocument.type === 'LEGACY_INVENTORY') return '历史未追踪库存（兼容批次）'
  if (lot.sourceDocument.type === 'LEGACY_SHIPMENT') return `历史发货 ${lot.sourceDocument.number} · ${lot.sourceDocument.customer || '未知客户'}（兼容批次）`
  return `${lot.sourceType} · ${lot.sourceDocument.number}`
}

function CustomerReturnList({ title, empty, items, onSelect }: { title: string; empty: string; items: InventoryLotCustomerReturn[]; onSelect: (id: string) => void }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold text-gray-800">{title}</h4>
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">{empty}</div>}
        {items.map((item) => (
          <div key={item.id}>
            <LotSummary lot={item.lot} onSelect={onSelect} />
            <div className="mt-1 px-1 text-[11px] text-gray-500">{item.returnNo} · 原发货 {item.shipmentNo} · {item.customer} · 退回 {numberText(item.stockQty)} · {item.reason}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LotSummary({ lot, active, onSelect }: { lot: InventoryLotTraceNode; active?: boolean; onSelect?: (id: string) => void }) {
  const positiveBalances = lot.balances.filter((item) => item.stockQty > 0.000001)
  const displayedBalances = positiveBalances.length > 0 ? positiveBalances : lot.balances.slice(0, 1)
  const inventoryStatuses = Array.from(
    new Set(displayedBalances.map((item) => inventoryStatusLabel(item.inventoryStatus))),
  )
  return (
    <button type="button" onClick={() => onSelect?.(lot.id)} disabled={!onSelect} className={`w-full rounded-lg border p-3 text-left ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'} disabled:cursor-default`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-blue-700">{lot.lotNo}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{inventoryStatuses.length > 0 ? inventoryStatuses.join(' / ') : lot.status}</span>
      </div>
      <div className="mt-1 text-sm font-medium text-gray-900">{lot.material.code} · {lot.material.name}</div>
      <div className="mt-1 text-xs text-gray-500">{sourceLabel(lot)}</div>
      {lot.supplierLotNo && <div className="mt-1 text-xs text-gray-600">供应批号：{lot.supplierLotNo}</div>}
      {displayedBalances.map((balance) => <div key={`${balance.location.id}:${balance.inventoryStatus}`} className="mt-1 text-xs text-gray-600">余额 {numberText(balance.stockQty)} {lot.material.stockUnit || lot.material.unit} · {balance.location.code}</div>)}
    </button>
  )
}

function RelationList({ title, empty, items, onSelect }: { title: string; empty: string; items: InventoryLotTraceRelation[]; onSelect: (id: string) => void }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold text-gray-800">{title}</h4>
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">{empty}</div>}
        {items.map((item) => <div key={item.id}><LotSummary lot={item.lot} onSelect={onSelect} /><div className="mt-1 px-1 text-[11px] text-gray-500">经 {item.orderNo} / {item.actualNo} 投入 {numberText(item.stockQty)}，用于 {item.materialCode} · {item.materialName}</div></div>)}
      </div>
    </section>
  )
}

export default function InventoryLotTraceDialog({ lotId, onClose, onMessage }: { lotId: string; onClose: () => void; onMessage: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(lotId)
  const [data, setData] = useState<InventoryLotTrace | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadInventoryLotTrace(selectedId)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((error) => { if (!cancelled) onMessage(error instanceof Error ? error.message : '获取批次谱系失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId, onMessage])

  return (
    <ModalDialog title="批次正反向追溯" description="从当前批次查看来料、生产、质检、客户发货与退货回流。" onClose={onClose} size="wide" footer={<AppButton variant="primary" onClick={onClose}>关闭</AppButton>}>
      {loading && <AppLoadingIndicator compact label="正在加载批次谱系..." className="rounded-lg border border-gray-200 bg-gray-50" />}
      {!loading && data && <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr_1fr]">
          <RelationList title={`上游投入批次 · ${data.upstream.length}`} empty="该批次没有上游生产投入；来料、退货或历史兼容批次通常从这里开始。" items={data.upstream} onSelect={setSelectedId} />
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-800">当前批次</h4>
            <LotSummary lot={data.lot} active />
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <div className="font-medium text-gray-800">质量与状态</div>
              {data.lot.inspections.length === 0 && <div className="mt-1">无独立质量检验记录</div>}
              {data.lot.inspections.map((inspection) => <div key={inspection.inspectionNo} className="mt-1">{inspection.inspectionNo} · {inspection.result === 'PASS' ? '合格' : inspection.result === 'FAIL' ? '不合格' : '待检'} · 抽检 {numberText(inspection.sampleQty)}</div>)}
            </div>
          </section>
          <RelationList title={`下游产出批次 · ${data.downstream.length}`} empty="当前没有下游生产产出；可能尚未投入生产。" items={data.downstream} onSelect={setSelectedId} />
        </div>
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">客户履约追溯</h3>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <section>
              <h4 className="mb-2 text-sm font-semibold text-gray-800">客户发货去向 · {data.customerShipments.length}</h4>
              <div className="space-y-2">
                {data.customerShipments.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">该批次尚无客户发货记录。</div>}
                {data.customerShipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-mono font-medium text-blue-700">{shipment.shipmentNo}</span><span>{shipment.status === 'DELIVERED' ? '已签收' : '已发货'}</span></div>
                    <div className="mt-1 font-medium text-gray-900">{shipment.customerCode ? `${shipment.customerCode} · ` : ''}{shipment.customer}</div>
                    <div className="mt-1">发出 {numberText(shipment.stockQty)} · 已退 {numberText(shipment.returnedStockQty)} · {shipment.location.code}</div>
                    {shipment.trackingNo && <div className="mt-1">物流：{shipment.trackingNo}</div>}
                  </div>
                ))}
              </div>
            </section>
            <CustomerReturnList title={`客户退货来源 · ${data.returnSources.length}`} empty="当前批次不是由客户退货形成。" items={data.returnSources} onSelect={setSelectedId} />
            <CustomerReturnList title={`退货回流批次 · ${data.returnDescendants.length}`} empty="当前发货批次尚无已收货的客户退货。" items={data.returnDescendants} onSelect={setSelectedId} />
          </div>
        </div>
      </div>}
    </ModalDialog>
  )
}
