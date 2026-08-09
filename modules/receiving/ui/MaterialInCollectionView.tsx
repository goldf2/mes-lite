'use client'

import AppButton from '@/app/components/AppButton'
import AttachmentPanel from '@/app/components/AttachmentPanel'
import { BusinessDocumentPrintLink } from '@/modules/business-documents'
import SortableTableHeader, { type TableSortDirection } from '@/app/components/SortableTableHeader'
import type { MaterialInRecord } from '../contracts/material-in'
import {
  displayMaterialInPriceUnit,
  materialInStatusColors,
  materialInStatusLabels,
} from '../model/material-in-view'

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
          <button type="button" onClick={() => props.onReceive(item.id)} disabled={props.loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white transition hover:bg-green-700 disabled:opacity-50">收货</button>
          <button type="button" onClick={() => props.onReject(item.id)} disabled={props.loading} className="rounded bg-red-600 px-3 py-1 text-xs text-white transition hover:bg-red-700 disabled:opacity-50">拒收</button>
        </>
      )}
      {item.status === 'RECEIVED' && (
        <button type="button" onClick={() => props.onReverse(item)} disabled={props.loading} className="rounded bg-orange-600 px-3 py-1 text-xs text-white transition hover:bg-orange-700 disabled:opacity-50">红冲</button>
      )}
      {item.status !== 'PENDING' && item.status !== 'RECEIVED' && <span className="text-xs text-gray-400">无操作</span>}
    </div>
  )
}

export default function MaterialInCollectionView(props: MaterialInCollectionViewProps) {
  if (props.items.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 sm:py-12">
        <p className="mb-4 text-4xl">📦</p>
        <p>暂无来料单</p>
      </div>
    )
  }

  if (props.viewMode === 'card') {
    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {props.items.map((item) => (
          <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm font-semibold text-blue-700">{item.inboundNo}</div>
                <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
                <div className="mt-1 text-xs text-gray-500">{new Date(item.inboundDate).toLocaleString('zh-CN')}</div>
              </div>
              <StatusBadge item={item} />
            </div>
            <div className="mt-3 grid gap-3 sm:mt-4 md:grid-cols-2">
              <div><div className="text-xs text-gray-500">供应商</div><div className="mt-1 font-medium text-gray-900">{item.supplier?.name}</div></div>
              <div>
                <div className="text-xs text-gray-500">物料</div>
                <div className="mt-1 font-medium text-gray-900">{item.material?.name}</div>
                <div className="text-xs text-gray-500">{item.material?.code} · 客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                <div className="mt-1 text-xs text-blue-700">库位：{item.location ? `${item.location.code} · ${item.location.name}` : '默认库位'}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-4">
              <div className="rounded bg-gray-50 p-2 sm:p-3"><div className="text-xs text-gray-500">库存数量</div><div className="mt-1 font-semibold">{item.qty} {item.unit}</div><div className="mt-0.5 text-xs text-gray-500">{item.pieceCount || 0} 件 · {item.totalLength || (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)} m · {item.totalWeight || 0} kg</div></div>
              <div className="rounded bg-gray-50 p-2 sm:p-3"><div className="text-xs text-gray-500">核算数量</div><div className="mt-1 font-semibold text-green-700">{item.valuationQty} {item.valuationUnit}</div></div>
              <div className="rounded bg-gray-50 p-2 sm:p-3"><div className="text-xs text-gray-500">单价</div><div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(4)}</div><div className="text-[11px] text-gray-500">/{displayMaterialInPriceUnit(item.priceUnit || item.valuationUnit)}</div></div>
              <div className="rounded bg-gray-50 p-2 sm:p-3"><div className="text-xs text-gray-500">金额</div><div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div></div>
            </div>
            <div className="mt-3 text-xs text-gray-500">批次：{item.batchNo || '-'} · 1 {item.unit} = {item.conversionRate} {item.valuationUnit} · {item.conversionSource === 'DOCUMENT_ACTUAL' ? '本批实测换算' : '物料默认换算'} · 按 {displayMaterialInPriceUnit(item.priceUnit || item.valuationUnit)} 计价</div>
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
      <table className="w-full min-w-[1240px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
        <thead className="bg-gray-50">
          <tr>
            <SortableTableHeader column="inboundNo" {...headerProps}>入库单号</SortableTableHeader>
            <SortableTableHeader column="voucherNo" {...headerProps}>凭据号</SortableTableHeader>
            <SortableTableHeader column="supplier" {...headerProps}>供应商</SortableTableHeader>
            <SortableTableHeader column="material" {...headerProps}>物料</SortableTableHeader>
            <SortableTableHeader column="location" {...headerProps}>收货库位</SortableTableHeader>
            <SortableTableHeader column="qty" {...headerProps}>库存数量</SortableTableHeader>
            <SortableTableHeader column="valuationQty" {...headerProps}>核算数量</SortableTableHeader>
            <SortableTableHeader column="unitPrice" {...headerProps}>报价单价</SortableTableHeader>
            <SortableTableHeader column="valuationUnitCost" {...headerProps}>每核算单位成本</SortableTableHeader>
            <SortableTableHeader column="stockUnitCost" {...headerProps}>每库存单位成本</SortableTableHeader>
            <SortableTableHeader column="totalAmount" {...headerProps}>总金额</SortableTableHeader>
            <SortableTableHeader column="batchNo" {...headerProps}>批次</SortableTableHeader>
            <SortableTableHeader column="status" {...headerProps}>状态</SortableTableHeader>
            <SortableTableHeader column="inboundDate" {...headerProps}>入库日期</SortableTableHeader>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">附件</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {props.items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-blue-600">{item.inboundNo}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
              <td className="px-4 py-3"><div className="font-medium">{item.supplier?.name}</div></td>
              <td className="px-4 py-3"><div className="font-medium">{item.material?.name}</div><div className="text-xs text-gray-500">{item.material?.code}</div><div className="text-xs text-gray-500">客户：{item.material?.customer?.name || '通用/未绑定'}</div></td>
              <td className="px-4 py-3 text-sm">{item.location ? <><div>{item.location.name}</div><div className="font-mono text-xs text-gray-500">{item.location.code}</div></> : '默认库位'}</td>
              <td className="px-4 py-3"><div>{item.qty} {item.unit}</div><div className="text-xs text-gray-500">{item.pieceCount || 0} 件 · {item.totalLength || (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)} m · {item.totalWeight || 0} kg</div></td>
              <td className="px-4 py-3"><div>{item.valuationQty} {item.valuationUnit}</div><div className="text-xs text-gray-500">1 {item.unit} = {item.conversionRate} {item.valuationUnit}</div></td>
              <td className="px-4 py-3"><div>¥{item.unitPrice.toFixed(4)} / {displayMaterialInPriceUnit(item.priceUnit || item.valuationUnit)}</div><div className="text-xs text-gray-500">按 {displayMaterialInPriceUnit(item.priceUnit || item.valuationUnit)} 计价</div></td>
              <td className="px-4 py-3">¥{(item.valuationUnitCost || item.unitPrice).toFixed(4)} / {item.valuationUnit}</td>
              <td className="px-4 py-3">¥{item.stockUnitCost.toFixed(4)} / {item.unit}</td>
              <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
              <td className="px-4 py-3 text-sm">{item.batchNo || '-'}</td>
              <td className="px-4 py-3"><StatusBadge item={item} /></td>
              <td className="px-4 py-3 text-sm text-gray-500">{new Date(item.inboundDate).toLocaleString('zh-CN')}</td>
              <td className="px-4 py-3"><AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact compactMode="summary" onMessage={props.onMessage} /></td>
              <td className="px-4 py-3"><ItemActions item={item} compact loading={props.loading} onDetail={props.onDetail} onEdit={props.onEdit} onReceive={props.onReceive} onReject={props.onReject} onReverse={props.onReverse} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
