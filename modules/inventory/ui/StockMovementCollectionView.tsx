'use client'

import type { StockMovement, StockMovementWorkspace } from '../contracts/stock-movement'
import {
  stockMovementAmountText,
  stockMovementQuantityText,
  stockMovementRelationLabel,
  stockMovementReferenceLabel,
  stockMovementTone,
  stockMovementTypeLabel,
} from '../model/stock-movement-view'

function SourceReference({ movement }: { movement: StockMovement }) {
  if (!movement.refType && !movement.refId) return <span className="text-gray-400">-</span>
  return (
    <div>
      <div className="font-medium text-gray-700">{movement.refType ? stockMovementReferenceLabel(movement.refType) : '业务来源'}</div>
      <div className="mt-0.5 max-w-52 truncate font-mono text-xs text-gray-500" title={movement.refId || undefined}>{movement.refId || '-'}</div>
    </div>
  )
}
function LedgerRelation({ movement }: { movement: StockMovement }) {
  const relationId = movement.reversalMovementId || movement.sourceMovementId || undefined
  return <span className={relationId ? 'text-blue-700' : 'text-gray-400'} title={relationId}>{stockMovementRelationLabel(movement)}</span>
}
function BalanceChange({ movement }: { movement: StockMovement }) {
  return (
    <div className="whitespace-nowrap text-sm">
      <span className="text-gray-500">{stockMovementQuantityText(movement.beforeQty)}</span>
      <span className="px-1.5 text-gray-300">→</span>
      <span className="font-medium text-gray-900">{stockMovementQuantityText(movement.afterQty, movement.stockUnit)}</span>
    </div>
  )
}

function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: StockMovementWorkspace['pagination']
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const totalPages = Math.max(1, pagination.totalPages || 1)
  const currentPage = Math.min(Math.max(1, pagination.page), totalPages)
  const start = pagination.total === 0 ? 0 : (currentPage - 1) * pagination.pageSize + 1
  const end = Math.min(pagination.total, currentPage * pagination.pageSize)
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div>共 {pagination.total} 条，当前 {start}-{end} 条，第 {currentPage}/{totalPages} 页</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={pagination.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
        </select>
        {[
          ['首页', 1, currentPage <= 1],
          ['上一页', currentPage - 1, currentPage <= 1],
          ['下一页', currentPage + 1, currentPage >= totalPages],
          ['末页', totalPages, currentPage >= totalPages],
        ].map(([label, page, disabled]) => (
          <button key={String(label)} type="button" onClick={() => onPageChange(Number(page))} disabled={Boolean(disabled)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function StockMovementCollectionView({
  items,
  viewMode,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  items: StockMovement[]
  viewMode: 'card' | 'list'
  pagination: StockMovementWorkspace['pagination']
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  if (items.length === 0) return <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-500">当前条件下暂无库存流水</div>

  if (viewMode === 'card') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {items.map((movement) => (
            <article key={movement.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{movement.object.code} · {movement.object.name}</div>
                  <div className="mt-1 truncate text-xs text-gray-500">{movement.object.spec || (movement.object.kind === 'material' ? '物料' : '内部兼容物料')}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${stockMovementTone(movement.qty)}`}>{stockMovementTypeLabel(movement.type)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                <div><div className="text-xs text-gray-500">本次变化</div><div className={`mt-1 font-semibold ${movement.qty > 0 ? 'text-emerald-700' : movement.qty < 0 ? 'text-amber-700' : 'text-gray-700'}`}>{movement.qty > 0 ? '+' : ''}{stockMovementQuantityText(movement.qty, movement.stockUnit)}</div></div>
                <div><div className="text-xs text-gray-500">变化后库存</div><div className="mt-1 font-semibold text-gray-900">{stockMovementQuantityText(movement.afterQty, movement.stockUnit)}</div></div>
                <div><div className="text-xs text-gray-500">核算数量变化</div><div className="mt-1 text-gray-700">{stockMovementQuantityText(movement.valuationQty, movement.valuationUnit)}</div></div>
                <div><div className="text-xs text-gray-500">成本变化</div><div className="mt-1 text-gray-700">{stockMovementAmountText(movement.costAmount)}</div></div>
              </div>
              <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-gray-500">时间</dt><dd>{new Date(movement.createdAt).toLocaleString('zh-CN')}</dd>
                <dt className="text-gray-500">库位</dt><dd>{movement.location ? `${movement.location.code} · ${movement.location.name}` : '-'}</dd>
                <dt className="text-gray-500">来源</dt><dd><SourceReference movement={movement} /></dd>
                <dt className="text-gray-500">账本关系</dt><dd><LedgerRelation movement={movement} /></dd>
                <dt className="text-gray-500">操作人</dt><dd>{movement.createdBy || '-'}</dd>
                <dt className="text-gray-500">备注</dt><dd className="line-clamp-2">{movement.note || '-'}</dd>
              </dl>
            </article>
          ))}
        </div>
        <Pagination pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      </>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full min-w-[1640px]">
          <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-600"><tr>
            <th className="px-4 py-3">时间</th><th className="px-4 py-3">流水类型</th><th className="px-4 py-3">库存对象</th><th className="px-4 py-3">库位</th><th className="px-4 py-3">本次变化</th><th className="px-4 py-3">库存前后</th><th className="px-4 py-3">核算 / 成本变化</th><th className="px-4 py-3">来源单据</th><th className="px-4 py-3">账本关系</th><th className="px-4 py-3">操作人 / 备注</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((movement) => (
              <tr key={movement.id} className="align-top hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{new Date(movement.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stockMovementTone(movement.qty)}`}>{stockMovementTypeLabel(movement.type)}</span></td>
                <td className="px-4 py-3"><div className="font-medium text-gray-900">{movement.object.code}</div><div className="mt-0.5 text-sm text-gray-700">{movement.object.name}</div><div className="mt-0.5 text-xs text-gray-500">{movement.object.spec || '-'}</div></td>
                <td className="px-4 py-3 text-sm">{movement.location ? <><div>{movement.location.code}</div><div className="mt-0.5 text-xs text-gray-500">{movement.location.name}</div></> : '-'}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${movement.qty > 0 ? 'text-emerald-700' : movement.qty < 0 ? 'text-amber-700' : 'text-gray-700'}`}>{movement.qty > 0 ? '+' : ''}{stockMovementQuantityText(movement.qty, movement.stockUnit)}</td>
                <td className="px-4 py-3"><BalanceChange movement={movement} /></td>
                <td className="px-4 py-3 text-sm"><div>{stockMovementQuantityText(movement.valuationQty, movement.valuationUnit)}</div><div className="mt-1 text-xs text-gray-500">{stockMovementAmountText(movement.costAmount)}</div></td>
                <td className="px-4 py-3 text-sm"><SourceReference movement={movement} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm"><LedgerRelation movement={movement} /></td>
                <td className="px-4 py-3 text-sm"><div>{movement.createdBy || '-'}</div><div className="mt-1 max-w-60 line-clamp-2 text-xs text-gray-500" title={movement.note || undefined}>{movement.note || '-'}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
    </>
  )
}
