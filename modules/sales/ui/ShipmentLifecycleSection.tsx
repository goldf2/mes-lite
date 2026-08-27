'use client'

import type { Shipment } from '../contracts/fulfillment'
import ShipmentStatusActions from './ShipmentStatusActions'

export default function ShipmentLifecycleSection({
  shipment,
  canDispatch,
  canDeliver,
  canCancel,
  canReverse,
  onChanged,
  onMessage,
}: {
  shipment: Shipment
  canDispatch: boolean
  canDeliver: boolean
  canCancel: boolean
  canReverse: boolean
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const guidance = {
    PENDING: '尚未扣减库存；可确认发货，发现单据错误可直接取消。',
    SHIPPED: '库存已经扣减；客户收货后确认签收，错发且尚未签收时可由仓库主管冲销。',
    DELIVERED: '客户已经签收；后续退回必须建立退货单并按退货质检流程入库。',
    CANCELLED: '单据在发货前取消，没有发生库存过账。',
    REVERSED: '原发货记录保留，库存、成本和内部批次已经通过逆向流水恢复。',
  }[shipment.status]

  return (
    <section className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">单据状态与下一步</h3>
          <p className="mt-1 text-xs text-gray-600">{guidance}</p>
        </div>
        <ShipmentStatusActions
          shipment={shipment}
          canDispatch={canDispatch}
          canDeliver={canDeliver}
          canCancel={canCancel}
          canReverse={canReverse}
          onChanged={onChanged}
          onMessage={onMessage}
        />
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-3">
        <div><dt>发货</dt><dd className="mt-1 text-gray-900">{shipment.shippedAt ? `${new Date(shipment.shippedAt).toLocaleString('zh-CN')} · ${shipment.shippedBy || '未记录操作人'}` : '-'}</dd></div>
        <div><dt>签收</dt><dd className="mt-1 text-gray-900">{shipment.deliveredAt ? `${new Date(shipment.deliveredAt).toLocaleString('zh-CN')} · ${shipment.deliveredBy || '未记录操作人'}` : '-'}</dd></div>
        <div><dt>{shipment.status === 'REVERSED' ? '冲销' : '取消'}</dt><dd className="mt-1 text-gray-900">{shipment.status === 'REVERSED' ? `${shipment.reversedAt ? new Date(shipment.reversedAt).toLocaleString('zh-CN') : '-'} · ${shipment.reversedBy || '-'} · ${shipment.reverseReason || '-'}` : shipment.status === 'CANCELLED' ? `${shipment.cancelledAt ? new Date(shipment.cancelledAt).toLocaleString('zh-CN') : '-'} · ${shipment.cancelledBy || '-'} · ${shipment.cancelReason || '-'}` : '-'}</dd></div>
      </dl>
    </section>
  )
}
