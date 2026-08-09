import SortableTableHeader from '@/app/components/SortableTableHeader'
import type { TableSortDirection } from '@/app/components/SortableTableHeader'
import type { Stock } from '../contracts/stock'
import {
  materialCategoryLabels,
  occupiedStockLocations,
  stockDisplayCode,
  stockDisplayName,
  stockQuantityText,
  stockUnit,
} from '../model/stock-view'

interface StockSortState {
  sortedRows: Stock[]
  sortColumn: string
  sortDirection: TableSortDirection
  toggleSort: (column: string) => void
}

interface StockCollectionViewProps {
  viewMode: string
  sort: StockSortState
  selectedStockId?: string
  canAdjust: boolean
  onSelect: (stockId: string) => void
  onAdjust: (stock: Stock) => void
}

function StockImage({ stock, size }: { stock: Stock; size: 'sm' | 'md' }) {
  const image = stock.material?.primaryImage
  const dimensions = size === 'sm' ? 'h-14 w-14' : 'h-16 w-16'
  if (!image) return <div className={`flex ${dimensions} shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400`}>无图</div>
  return (
    <a href={image.originalUrl || image.url} target="_blank" rel="noreferrer" title={image.note || '查看物料图片'} className={`block ${dimensions} shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.thumbnailUrl || image.url} alt={image.note || stock.material?.name || '物料图片'} className="h-full w-full object-cover" />
    </a>
  )
}

function StockTypeBadges({ stock }: { stock: Stock }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`rounded px-2 py-1 text-xs font-medium ${stock.material ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
        {stock.material ? materialCategoryLabels[stock.material.category || 'RAW'] || '物料' : '成品'}
      </span>
      {stock.material?.deletedAt && <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">已归档</span>}
    </div>
  )
}

function StockTable({ sort, selectedStockId, canAdjust, onSelect, onAdjust }: Omit<StockCollectionViewProps, 'viewMode'>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm [&_td]:align-top [&_th]:whitespace-nowrap">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>
            <SortableTableHeader column="object" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>库存对象</SortableTableHeader>
            <SortableTableHeader column="customer" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>客户</SortableTableHeader>
            <SortableTableHeader column="type" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>类型</SortableTableHeader>
            <SortableTableHeader column="qty" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>库存</SortableTableHeader>
            <SortableTableHeader column="reservedQty" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>已预留</SortableTableHeader>
            <SortableTableHeader column="availableQty" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>可用</SortableTableHeader>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库位</th>
            <SortableTableHeader column="valuationQty" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>核算库存</SortableTableHeader>
            <SortableTableHeader column="totalCost" activeColumn={sort.sortColumn} direction={sort.sortDirection} onSort={sort.toggleSort}>库存金额</SortableTableHeader>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sort.sortedRows.map((stock) => {
            const locations = occupiedStockLocations(stock)
            const unit = stockUnit(stock)
            return (
              <tr key={stock.id} onClick={() => onSelect(stock.id)} className={`cursor-pointer transition ${selectedStockId === stock.id ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3"><StockImage stock={stock} size="sm" /></td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{stockDisplayName(stock)}</div>
                  <div className="text-xs text-gray-500">{stockDisplayCode(stock)}</div>
                  {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                </td>
                <td className="px-4 py-3 text-sm">{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}</td>
                <td className="px-4 py-3"><StockTypeBadges stock={stock} /></td>
                <td className="px-4 py-3 text-sm">
                  <div>{stockQuantityText(stock.qty)} {unit}</div>
                  {stock.packagingSummary && <div className="mt-1 text-xs font-medium text-emerald-700">穿透 {stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {unit}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-orange-600">{stockQuantityText(stock.reservedQty)} {unit}</td>
                <td className={`px-4 py-3 text-sm font-medium ${stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'}`}>{stockQuantityText(stock.availableQty)} {unit}</td>
                <td className="px-4 py-3 text-xs">
                  {locations.length > 0 ? (
                    <div className="space-y-1">
                      {locations.slice(0, 2).map((balance) => (
                        <div key={balance.id} className="flex max-w-44 justify-between gap-2 text-gray-600">
                          <span className="truncate" title={`${balance.location.code} · ${balance.location.name}`}>{balance.location.code}</span>
                          <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {unit}</span>
                        </div>
                      ))}
                      {locations.length > 2 && <div className="text-blue-600">另有 {locations.length - 2} 个库位</div>}
                    </div>
                  ) : <span className="text-gray-400">无库位库存</span>}
                </td>
                <td className="px-4 py-3 text-sm">{stock.material ? `${stockQuantityText(stock.valuationQty)} ${stock.material.valuationUnit}` : '-'}</td>
                <td className="px-4 py-3 text-sm">{stock.material ? `¥${Number(stock.totalCost || 0).toFixed(2)}` : '-'}</td>
                <td className="px-4 py-3">
                  {canAdjust && <button type="button" onClick={(event) => { event.stopPropagation(); onAdjust(stock) }} className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">存货调整</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StockCards({ sort, selectedStockId, canAdjust, onSelect, onAdjust }: Omit<StockCollectionViewProps, 'viewMode'>) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {sort.sortedRows.map((stock) => {
        const locations = occupiedStockLocations(stock)
        const unit = stockUnit(stock)
        return (
          <div key={stock.id} onClick={() => onSelect(stock.id)} className={`cursor-pointer rounded-lg border p-4 transition ${selectedStockId === stock.id ? 'border-blue-400 bg-blue-50/40 shadow-sm' : 'border-gray-200 hover:shadow-md'}`}>
            <div className="mb-3 flex items-start justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <StockImage stock={stock} size="md" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-800">{stockDisplayName(stock)}</div>
                  <div className="text-sm text-gray-500">{stockDisplayCode(stock)}</div>
                  <div className="text-xs text-gray-400">客户：{stock.material?.customer?.name || stock.product?.customer?.name || '通用/未绑定'}</div>
                  {stock.material?.spec && <div className="text-xs text-gray-400">{stock.material.spec}</div>}
                </div>
              </div>
              <StockTypeBadges stock={stock} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['库存', stock.qty, 'text-gray-900'],
                ['已预留', stock.reservedQty, 'text-orange-600'],
                ['可用', stock.availableQty, stock.availableQty < 10 ? 'text-red-600' : 'text-green-600'],
              ].map(([label, value, color]) => (
                <div key={String(label)}>
                  <div className="mb-1 text-xs text-gray-500">{label}</div>
                  <div className={`text-lg font-semibold ${color}`}>{stockQuantityText(Number(value))}</div>
                  <div className="text-[11px] text-gray-500">{unit}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-gray-700">库位库存</span><span className="text-gray-400">{locations.length} 个库位</span></div>
              {locations.length > 0 ? (
                <div className="space-y-1.5">
                  {locations.slice(0, 3).map((balance) => (
                    <div key={balance.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-gray-500" title={`${balance.location.code} · ${balance.location.name}`}>{balance.location.code} · {balance.location.name}</span>
                      <span className="shrink-0 font-medium text-gray-900">{stockQuantityText(balance.qty)} {unit}</span>
                    </div>
                  ))}
                  {locations.length > 3 && <div className="text-xs text-blue-600">另有 {locations.length - 3} 个库位，点击查看</div>}
                </div>
              ) : <div className="text-xs text-gray-400">当前没有库位库存</div>}
            </div>
            {stock.packagingSummary && (
              <div className="mt-3 border-t border-emerald-100 pt-3 text-xs">
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-emerald-800">包装穿透合计</span><span className="font-semibold text-emerald-800">{stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))} {unit}</span></div>
                <div className="mt-1 text-gray-500">散装 {stockQuantityText(stock.qty)} + 包装等效 {stockQuantityText(stock.packagingSummary.packagedEquivalentQty)}</div>
              </div>
            )}
            {stock.material && (
              <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                <div>核算库存：<span className="font-semibold text-gray-900">{stockQuantityText(stock.valuationQty)}</span> {stock.material.valuationUnit}</div>
                <div className="mt-1">库存金额：<span className="font-semibold text-gray-900">¥{Number(stock.totalCost || 0).toFixed(2)}</span></div>
                <div className="mt-1">成本：¥{Number(stock.valuationUnitCost || 0).toFixed(4)} / {stock.material.valuationUnit}<span className="ml-2">¥{Number(stock.stockUnitCost || 0).toFixed(4)} / {unit}</span></div>
                <div className="mt-1">当前实际换算：1 {unit} = {Number(stock.qty) > 0 ? (Number(stock.valuationQty) / Number(stock.qty)).toFixed(6) : '-'} {stock.material.valuationUnit}</div>
                <div className="mt-1 text-gray-500">物料默认换算：1 {unit} = {stock.material.conversionRate || 1} {stock.material.valuationUnit}</div>
              </div>
            )}
            {canAdjust && <button type="button" onClick={(event) => { event.stopPropagation(); onAdjust(stock) }} className="mt-3 w-full rounded-lg border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">存货调整</button>}
          </div>
        )
      })}
    </div>
  )
}

export default function StockCollectionView(props: StockCollectionViewProps) {
  return (
    <div className="min-w-0">
      {props.viewMode === 'list' ? <StockTable {...props} /> : <StockCards {...props} />}
      {props.sort.sortedRows.length === 0 && <div className="py-12 text-center text-gray-500">暂无库存记录</div>}
    </div>
  )
}
