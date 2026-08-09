import type { Stock } from '../contracts/stock'
import {
  occupiedStockLocations,
  stockDisplayCode,
  stockDisplayName,
  stockQuantityText,
  stockUnit,
} from '../model/stock-view'

export default function StockDetailPanel({
  stock,
  canAdjust,
  onAdjust,
}: {
  stock: Stock
  canAdjust: boolean
  onAdjust: (stock: Stock, locationId?: string) => void
}) {
  const locations = occupiedStockLocations(stock, true)
  const unit = stockUnit(stock)

  return (
    <aside className="min-w-0 border-t border-gray-200 pt-5 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{stockDisplayName(stock)}</div>
          <div className="mt-0.5 truncate text-xs text-gray-500">{stockDisplayCode(stock)}{stock.material?.spec ? ` · ${stock.material.spec}` : ''}</div>
        </div>
        {canAdjust && (
          <button type="button" onClick={() => onAdjust(stock)} className="shrink-0 rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
            调整
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-3 text-center">
        {[
          ['总库存', stock.qty, 'text-gray-900'],
          ['预留', stock.reservedQty, 'text-orange-600'],
          ['可用', stock.availableQty, 'text-emerald-700'],
        ].map(([label, value, color]) => (
          <div key={String(label)}>
            <div className="text-[11px] text-gray-500">{label}</div>
            <div className={`mt-1 text-sm font-semibold ${color}`}>{stockQuantityText(Number(value))}</div>
          </div>
        ))}
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">库位明细</h3>
          <span className="text-xs text-gray-400">{locations.length} 个有库存库位</span>
        </div>
        {locations.length > 0 ? (
          <div className="divide-y divide-gray-100 border-y border-gray-100">
            {locations.map((balance) => (
              <div key={balance.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-gray-800">{balance.location.code} · {balance.location.name}</div>
                    <div className="mt-1 text-[11px] text-gray-500">预留 {stockQuantityText(balance.reservedQty)} · 可用 {stockQuantityText(balance.availableQty)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-gray-900">{stockQuantityText(balance.qty)} {unit}</div>
                    {canAdjust && (
                      <button type="button" onClick={() => onAdjust(stock, balance.locationId)} className="mt-1 text-[11px] font-medium text-blue-600 hover:text-blue-800">
                        调整此库位
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">当前没有库位库存</div>
        )}
      </section>

      {stock.packagingDefinition && (
        <section className="mt-5 border-t border-amber-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-amber-900">包装 BOM</h3>
            <span className="text-xs text-amber-700">{stock.packagingDefinition.bom.version}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{stock.packagingDefinition.bom.name}</div>
          <div className="mt-2 space-y-1.5">
            {stock.packagingDefinition.contents.map((content) => (
              <div key={content.material.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-gray-600">{content.material.code} · {content.material.name}</span>
                <span className="shrink-0 font-medium text-gray-900">
                  {stockQuantityText(content.quantity)} {content.material.stockUnit} / {stockQuantityText(stock.packagingDefinition!.outputQuantity)} {stock.packagingDefinition!.outputUnit}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stock.packagingSummary && (
        <section className="mt-5 border-t border-emerald-100 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">包装穿透</h3>
              <div className="mt-1 text-xs text-gray-500">散装与包装库存等效汇总</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-emerald-800">{stockQuantityText(Number(stock.qty) + Number(stock.packagingSummary.packagedEquivalentQty))}</div>
              <div className="text-[11px] text-gray-500">{unit}</div>
            </div>
          </div>
          <div className="mt-3 divide-y divide-emerald-100 border-y border-emerald-100">
            <div className="flex justify-between gap-3 py-2 text-xs">
              <span className="text-gray-600">散装实际库存</span>
              <span className="font-medium text-gray-900">{stockQuantityText(stock.qty)} {stock.material?.stockUnit}</span>
            </div>
            {stock.packagingSummary.sources.map((source) => (
              <div key={source.stockId} className="py-2.5 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-gray-700">{source.material.code} · {source.material.name}</span>
                  <span className="shrink-0 font-medium text-emerald-800">等效 {stockQuantityText(source.equivalentQty)} {stock.material?.stockUnit}</span>
                </div>
                <div className="mt-1 text-gray-500">实际 {stockQuantityText(source.qty)} {source.material.stockUnit} · {source.bom.name} {source.bom.version}</div>
                {source.locations.map((location) => (
                  <div key={location.locationId} className="mt-1 flex justify-between gap-3 pl-2 text-[11px] text-gray-500">
                    <span className="truncate">{location.code} · {location.name}</span>
                    <span className="shrink-0">{stockQuantityText(location.qty)} {source.material.stockUnit} → {stockQuantityText(location.equivalentQty)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
