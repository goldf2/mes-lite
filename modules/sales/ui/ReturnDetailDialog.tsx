'use client'

import { BusinessDocumentDetailDialog, BusinessDocumentPrintLink } from '@/modules/business-documents'
import { QualityLotCard } from '@/modules/quality'
import type { ReturnOrder } from '../contracts/fulfillment'
import { returnStatusLabels } from '../model/fulfillment-view'

export default function ReturnDetailDialog({
  item,
  canQualityUpdate,
  onClose,
  onChanged,
  onMessage,
}: {
  item: ReturnOrder
  canQualityUpdate: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
  onMessage: (message: string) => void
}) {
  return (
    <BusinessDocumentDetailDialog
      title={`退货单 ${item.returnNo}`}
      description={`关联发货单：${item.shipment?.shipmentNo || '-'} · ${returnStatusLabels[item.status] || item.status}`}
      ownerType="RETURN_ORDER"
      ownerId={item.id}
      onClose={onClose}
      onMessage={onMessage}
      headerActions={<BusinessDocumentPrintLink kind="return" id={item.id} />}
    >
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-gray-500">物料</dt><dd className="mt-1 font-medium text-gray-900">{item.product?.name}</dd><dd className="text-xs text-gray-500">{item.product?.sku}</dd></div>
        <div><dt className="text-gray-500">客户</dt><dd className="mt-1 font-medium text-gray-900">{item.shipment?.customerRef?.name || item.product?.customer?.name || '通用/未绑定'}</dd></div>
        <div><dt className="text-gray-500">退回库位</dt><dd className="mt-1 font-medium text-gray-900">{item.location ? `${item.location.code} · ${item.location.name}` : '-'}</dd></div>
        <div><dt className="text-gray-500">创建时间</dt><dd className="mt-1 font-medium text-gray-900">{new Date(item.createdAt).toLocaleString('zh-CN')}</dd></div>
        <div><dt className="text-gray-500">退货数量</dt><dd className="mt-1 font-medium text-gray-900">{item.qty}</dd></div>
        <div className="sm:col-span-2"><dt className="text-gray-500">退货原因</dt><dd className="mt-1 font-medium text-gray-900">{item.reason}</dd></div>
        <div><dt className="text-gray-500">处理时间</dt><dd className="mt-1 font-medium text-gray-900">{item.processedAt ? new Date(item.processedAt).toLocaleString('zh-CN') : '-'}</dd></div>
      </dl>
      {item.lotAllocations.length > 0 && (
        <section className="mt-5 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">原发货批次来源</h3>
          <div className="mt-2 space-y-2">
            {item.lotAllocations.map((allocation) => (
              <div key={allocation.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono font-medium text-gray-900">{allocation.shipmentAllocation.lot.lotNo}</span>
                  <span>本次退回 {allocation.stockQty} {item.product?.unit || ''}</span>
                </div>
                <div className="mt-1">原发货单 {item.shipment?.shipmentNo || '-'} · 发货库位 {allocation.shipmentAllocation.location.code}</div>
                {allocation.shipmentAllocation.lot.sourceType === 'LEGACY_SHIPMENT' && <div className="mt-1 text-amber-700">历史单据没有真实批次数据，此来源为显式兼容记录。</div>}
              </div>
            ))}
          </div>
        </section>
      )}
      {item.inventoryLot && (
        <section className="mt-5 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">退货待检批次</h3>
          <QualityLotCard lot={item.inventoryLot} canDecide={canQualityUpdate} onMessage={onMessage} onChanged={onChanged} />
        </section>
      )}
    </BusinessDocumentDetailDialog>
  )
}
