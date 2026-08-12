'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { InventoryLotTraceDialog } from '@/modules/inventory'

import { BusinessDocumentDetailDialog, BusinessDocumentPrintLink } from '@/modules/business-documents'
import type { MaterialInRecord } from '../contracts/material-in'
import { materialInStatusLabels } from '../model/material-in-view'

function conversionSourceLabel(source?: string, sampleCount = 0) {
  if (source === 'DOCUMENT_ACTUAL') return '本批实测'
  if (source === 'HISTORICAL_ESTIMATE') return `历史推算 · ${sampleCount} 批`
  if (source === 'SAME_UNIT') return '同主单位'
  return '旧标准换算'
}

export default function MaterialInDetailDialog({
  item,
  onClose,
  onMessage,
}: {
  item: MaterialInRecord
  onClose: () => void
  onMessage: (message: string) => void
}) {
  const [traceLotId, setTraceLotId] = useState<string | null>(null)
  return (
    <>
    <BusinessDocumentDetailDialog
      title={`来料单 ${item.inboundNo}`}
      description={`凭据号：${item.voucherNo || '-'} · ${materialInStatusLabels[item.status] || item.status} · ${item.itemCount} 项物料`}
      ownerType="MATERIAL_IN"
      ownerId={item.id}
      onClose={onClose}
      onMessage={onMessage}
      headerActions={<BusinessDocumentPrintLink kind="material-in" id={item.id} />}
    >
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-gray-500">供应商</dt><dd className="mt-1 font-medium text-gray-900">{item.supplier?.name || '-'}</dd></div>
        <div><dt className="text-gray-500">待分库库位</dt><dd className="mt-1 font-medium text-gray-900">{item.location.code} · {item.location.name}</dd></div>
        <div><dt className="text-gray-500">入库日期</dt><dd className="mt-1 font-medium text-gray-900">{new Date(item.inboundDate).toLocaleString('zh-CN')}</dd></div>
        <div><dt className="text-gray-500">金额</dt><dd className="mt-1 font-medium text-gray-900">¥{item.totalAmount.toFixed(2)}</dd></div>
      </dl>
      <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-3">行</th><th className="px-4 py-3">物料</th><th className="px-4 py-3">主单位数量</th><th className="px-4 py-3">辅助数量 / 来源</th><th className="px-4 py-3">本批换算</th><th className="px-4 py-3">批次</th><th className="px-4 py-3 text-right">金额</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {item.items.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3 text-gray-500">{line.lineNo}</td>
                <td className="px-4 py-3"><div className="font-medium text-gray-900">{line.material.code} · {line.material.name}</div><div className="text-xs text-gray-500">{line.material.spec || '无规格'}</div></td>
                <td className="px-4 py-3 font-medium">{line.qty} {line.unit}</td>
                <td className="px-4 py-3"><div>{line.valuationQty} {line.valuationUnit}</div><div className="mt-0.5 text-xs text-gray-500">{conversionSourceLabel(line.conversionSource, line.conversionSampleCount)}</div></td>
                <td className="px-4 py-3 text-gray-600">1 {line.unit} = {line.conversionRate} {line.valuationUnit}</td>
                <td className="px-4 py-3"><div>{line.batchNo || '-'}</div>{line.inventoryLot && <div className="mt-1"><div className="font-mono text-xs text-blue-700">内部 {line.inventoryLot.lotNo}</div><AppButton size="sm" variant="secondary" onClick={() => setTraceLotId(line.inventoryLot!.id)}>查看谱系</AppButton></div>}</td>
                <td className="px-4 py-3 text-right font-medium">¥{line.totalAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BusinessDocumentDetailDialog>
    {traceLotId && <InventoryLotTraceDialog lotId={traceLotId} onClose={() => setTraceLotId(null)} onMessage={onMessage} />}
    </>
  )
}
