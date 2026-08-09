'use client'

import BusinessDocumentDetailDialog from '@/app/components/BusinessDocumentDetailDialog'
import BusinessDocumentPrintLink from '@/app/components/BusinessDocumentPrintLink'
import type { MaterialInRecord } from '../contracts/material-in'
import { materialInStatusLabels } from '../model/material-in-view'

export default function MaterialInDetailDialog({
  item,
  onClose,
  onMessage,
}: {
  item: MaterialInRecord
  onClose: () => void
  onMessage: (message: string) => void
}) {
  return (
    <BusinessDocumentDetailDialog
      title={`来料单 ${item.inboundNo}`}
      description={`凭据号：${item.voucherNo || '-'} · ${materialInStatusLabels[item.status] || item.status}`}
      ownerType="MATERIAL_IN"
      ownerId={item.id}
      onClose={onClose}
      onMessage={onMessage}
      headerActions={<BusinessDocumentPrintLink kind="material-in" id={item.id} />}
    >
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-gray-500">供应商</dt><dd className="mt-1 font-medium text-gray-900">{item.supplier?.name || '-'}</dd></div>
        <div><dt className="text-gray-500">物料</dt><dd className="mt-1 font-medium text-gray-900">{item.material?.name}</dd><dd className="text-xs text-gray-500">{item.material?.code}</dd></div>
        <div><dt className="text-gray-500">收货库位</dt><dd className="mt-1 font-medium text-gray-900">{item.location ? `${item.location.code} · ${item.location.name}` : '默认库位'}</dd></div>
        <div><dt className="text-gray-500">入库日期</dt><dd className="mt-1 font-medium text-gray-900">{new Date(item.inboundDate).toLocaleString('zh-CN')}</dd></div>
        <div><dt className="text-gray-500">库存数量</dt><dd className="mt-1 font-medium text-gray-900">{item.qty} {item.unit}</dd></div>
        <div><dt className="text-gray-500">核算数量</dt><dd className="mt-1 font-medium text-gray-900">{item.valuationQty} {item.valuationUnit}</dd></div>
        <div><dt className="text-gray-500">批次</dt><dd className="mt-1 font-medium text-gray-900">{item.batchNo || '-'}</dd></div>
        <div><dt className="text-gray-500">金额</dt><dd className="mt-1 font-medium text-gray-900">¥{item.totalAmount.toFixed(2)}</dd></div>
      </dl>
    </BusinessDocumentDetailDialog>
  )
}
