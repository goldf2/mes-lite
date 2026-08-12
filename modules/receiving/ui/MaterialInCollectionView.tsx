'use client'

import AppButton from '@/app/components/AppButton'
import { AttachmentPanel } from '@/modules/attachments'
import { BusinessDocumentPrintLink } from '@/modules/business-documents'
import SortableTableHeader, { type TableSortDirection } from '@/app/components/SortableTableHeader'
import type { MaterialInRecord } from '../contracts/material-in'
import { materialInStatusColors, materialInStatusLabels } from '../model/material-in-view'

interface MaterialInCollectionViewProps {
  items: MaterialInRecord[]
  viewMode: string
  loading: boolean
  sortColumn: string
  sortDirection: TableSortDirection
  onSort: (column: string) => void
  onMessage: (message: string) => void
  onDetail: (item: MaterialInRecord) => void
  onEdit: (item: MaterialInRecord) => void
  onReceive: (id: string) => void
  onReject: (id: string) => void
  onReverse: (item: MaterialInRecord) => void
}

function StatusBadge({ item }: { item: MaterialInRecord }) {
  return (
    <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${materialInStatusColors[item.status]}`}>
      {materialInStatusLabels[item.status] || item.status}
    </span>
  )
}

function ItemActions({ item, compact = false, ...props }: {
  item: MaterialInRecord
  compact?: boolean
  loading: boolean
  onDetail: (item: MaterialInRecord) => void
  onEdit: (item: MaterialInRecord) => void
  onReceive: (id: string) => void
  onReject: (id: string) => void
  onReverse: (item: MaterialInRecord) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <AppButton size="sm" variant="secondary" onClick={() => props.onDetail(item)}>详情</AppButton>
      <BusinessDocumentPrintLink kind="material-in" id={item.id} compact={compact} />
      {item.status === 'PENDING' && (
        <>
          <button type="button" onClick={() => props.onEdit(item)} disabled={props.loading} className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition hover:bg-blue-700 disabled:opacity-50">编辑</button>
          <button type="button" onClick={() => props.onReceive(item.id)} disabled={props.loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white transition hover:bg-green-700 disabled:opacity-50">整单收货</button>
          <button type="button" onClick={() => props.onReject(item.id)} disabled={props.loading} className="rounded bg-red-600 px-3 py-1 text-xs text-white transition hover:bg-red-700 disabled:opacity-50">整单拒收</button>
        </>
      )}
      {item.status === 'RECEIVED' && (
        <button type="button" onClick={() => props.onReverse(item)} disabled={props.loading} className="rounded bg-orange-600 px-3 py-1 text-xs text-white transition hover:bg-orange-700 disabled:opacity-50">整单红冲</button>
      )}
    </div>
  )
}

function ReceiptLines({ item, compact = false }: { item: MaterialInRecord; compact?: boolean }) {
  const shown = compact ? item.items.slice(0, 3) : item.items
  return (
    <div className="space-y-1.5">
      {shown.map((line) => (
        <div key={line.id} className="flex min-w-0 items-start justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="truncate font-medium text-gray-900">{line.material.code} · {line.material.name}</div>
            <div className="truncate text-gray-500">{line.material.spec || '无规格'}{line.batchNo ? ` · 供应批号 ${line.batchNo}` : ''}</div>
            {line.inventoryLot && <div className="truncate font-mono text-[11px] text-blue-700">内部批次 {line.inventoryLot.lotNo}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-medium text-gray-800">{line.qty} {line.unit}</div>
            <div className="text-gray-500">¥{line.totalAmount.toFixed(2)}</div>
          </div>
        </div>
      ))}
      {compact && item.items.length > shown.length && <div className="text-xs text-gray-500">另有 {item.items.length - shown.length} 项，点击详情查看</div>}
    </div>
  )
}

export default function MaterialInCollectionView(props: MaterialInCollectionViewProps) {
  if (props.items.length === 0) {
    return <div className="py-12 text-center text-gray-500"><p className="mb-4 text-4xl">📦</p><p>暂无来料单</p></div>
  }

  if (props.viewMode === 'card') {
    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {props.items.map((item) => (
          <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm font-semibold text-blue-700">{item.inboundNo}</div>
                <div className="mt-1 font-medium text-gray-900">{item.supplier.name}</div>
                <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'} · {new Date(item.inboundDate).toLocaleString('zh-CN')}</div>
              </div>
              <StatusBadge item={item} />
            </div>
            <div className="mt-4"><ReceiptLines item={item} compact /></div>
            <div className="mt-3 flex flex-wrap justify-between gap-3 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm">
              <span>统一进入：<strong>{item.location.code} · {item.location.name}</strong></span>
              <span>{item.itemCount} 项 · 合计 <strong>¥{item.totalAmount.toFixed(2)}</strong></span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact compactMode="summary" onMessage={props.onMessage} />
              <ItemActions item={item} loading={props.loading} onDetail={props.onDetail} onEdit={props.onEdit} onReceive={props.onReceive} onReject={props.onReject} onReverse={props.onReverse} />
            </div>
          </article>
        ))}
      </div>
    )
  }

  const headerProps = { activeColumn: props.sortColumn, direction: props.sortDirection, onSort: props.onSort }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
        <thead className="bg-gray-50">
          <tr>
            <SortableTableHeader column="inboundNo" {...headerProps}>来料单号</SortableTableHeader>
            <SortableTableHeader column="supplier" {...headerProps}>供应商</SortableTableHeader>
            <SortableTableHeader column="material" {...headerProps}>物料明细</SortableTableHeader>
            <SortableTableHeader column="location" {...headerProps}>待分库库位</SortableTableHeader>
            <SortableTableHeader column="totalAmount" {...headerProps}>合计金额</SortableTableHeader>
            <SortableTableHeader column="status" {...headerProps}>状态</SortableTableHeader>
            <SortableTableHeader column="inboundDate" {...headerProps}>单据日期</SortableTableHeader>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">附件</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {props.items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-3"><div className="font-mono text-blue-600">{item.inboundNo}</div><div className="mt-1 text-xs text-gray-500">凭据：{item.voucherNo || '-'}</div></td>
              <td className="px-4 py-3 font-medium">{item.supplier.name}</td>
              <td className="max-w-[30rem] px-4 py-3"><ReceiptLines item={item} compact /></td>
              <td className="px-4 py-3"><div>{item.location.name}</div><div className="font-mono text-xs text-gray-500">{item.location.code}</div></td>
              <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
              <td className="px-4 py-3"><StatusBadge item={item} /></td>
              <td className="px-4 py-3 text-gray-500">{new Date(item.inboundDate).toLocaleString('zh-CN')}</td>
              <td className="px-4 py-3"><AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact compactMode="summary" onMessage={props.onMessage} /></td>
              <td className="px-4 py-3"><ItemActions item={item} compact loading={props.loading} onDetail={props.onDetail} onEdit={props.onEdit} onReceive={props.onReceive} onReject={props.onReject} onReverse={props.onReverse} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
