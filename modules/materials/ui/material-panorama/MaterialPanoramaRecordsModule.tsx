'use client'

import type { PanoramaData } from '../../contracts/material-panorama'
import { compactDate, formatMoney, formatNumber, statusText } from '../../model/material-panorama-view'
import { EmptyText, Panel } from './MaterialPanoramaPrimitives'

export default function MaterialPanoramaRecordsModule({ data }: { data: PanoramaData }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
      <Panel title="最近来料" action={`${data.recentMaterialIns.length} 条`}>
        {data.recentMaterialIns.length === 0 ? <EmptyText>暂无来料记录</EmptyText> : (
          <div className="space-y-2">{data.recentMaterialIns.map((item) => (
            <div key={item.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-blue-700">{item.inboundNo}</span><span className="shrink-0 text-xs text-gray-500">{statusText(item.status)}</span></div>
              <div className="mt-1 text-xs text-gray-600">{item.supplier.name} · {formatNumber(item.qty)} {item.unit} · {formatMoney(item.totalAmount)}</div>
              <div className="mt-1 text-xs text-gray-500">{compactDate(item.inboundDate)} · 批次 {item.batchNo || '-'}</div>
            </div>
          ))}</div>
        )}
      </Panel>
      <Panel title="最近库存流水" action={`${data.recentStockLogs.length} 条`}>
        {data.recentStockLogs.length === 0 ? <EmptyText>暂无库存流水</EmptyText> : (
          <div className="space-y-2">{data.recentStockLogs.map((log) => (
            <div key={log.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-900">{log.type}</span><span className="text-xs text-gray-500">{compactDate(log.createdAt)}</span></div>
              <div className="mt-1 text-xs text-gray-600">{formatNumber(log.beforeQty)} {'->'} {formatNumber(log.afterQty)}，变化 {formatNumber(log.qty)}</div>
              {log.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{log.note}</div>}
            </div>
          ))}</div>
        )}
      </Panel>
      <Panel title="成本层" action={`${data.costLayers.length} 层`}>
        {data.costLayers.length === 0 ? <EmptyText>暂无 FIFO 成本层记录</EmptyText> : (
          <div className="space-y-2">{data.costLayers.map((layer) => (
            <div key={layer.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-900">{layer.status}</span><span className="text-xs text-gray-500">{compactDate(layer.createdAt)}</span></div>
              <div className="mt-1 text-xs text-gray-600">剩余 {formatNumber(layer.remainingStockQty)} {layer.stockUnit} / {formatNumber(layer.remainingValuationQty)} {layer.valuationUnit}</div>
              <div className="mt-1 text-xs text-gray-500">金额 {formatMoney(layer.remainingAmount)} · {formatMoney(layer.stockUnitCost)} / {layer.stockUnit}</div>
            </div>
          ))}</div>
        )}
      </Panel>
    </div>
  )
}
