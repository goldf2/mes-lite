'use client'

import AppButton from '@/app/components/AppButton'
import type { Shipment } from '../contracts/fulfillment'

export default function ShipmentLotTraceSection({
  shipment,
  onTraceLot,
}: {
  shipment: Shipment
  onTraceLot: (lotId: string) => void
}) {
  const traceStatus = shipment.lotTraceStatus === 'TRACKED'
    ? '真实内部批次'
    : shipment.lotTraceStatus === 'LEGACY'
      ? '历史兼容批次'
      : shipment.lotTraceStatus === 'REVERSED'
        ? '已冲销恢复'
        : '待发货'

  return (
    <section className="mt-5 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">客户发货批次</h3>
        <span className="text-xs text-gray-500">追溯状态：{traceStatus}</span>
      </div>
      {shipment.lotAllocations.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">待确认发货后生成内部批次分配。</div>
      ) : (
        <div className="mt-2 space-y-2">
          {shipment.lotAllocations.map((allocation) => (
            <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
              <div>
                <div className="font-mono font-medium text-gray-900">{allocation.lot.lotNo}</div>
                <div className="mt-0.5 text-gray-500">{allocation.status === 'REVERSED' ? '原发出' : '发出'} {allocation.stockQty} · 已退 {allocation.returnedStockQty} · {allocation.location.code}{allocation.status === 'REVERSED' ? ' · 已恢复库存' : ''}</div>
                {allocation.lot.sourceType === 'LEGACY_SHIPMENT' && <div className="mt-0.5 text-amber-700">历史发货未保存真实批次，本记录仅显式标识兼容来源。</div>}
              </div>
              <AppButton size="sm" variant="secondary" onClick={() => onTraceLot(allocation.lot.id)}>查看谱系</AppButton>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
