'use client'

import { ArrowRight, Box, MapPin } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WarehouseTwinLocation } from '../model/warehouse-digital-twin'
import { warehouseTwinStatusLabel } from './WarehouseTwinCanvas'

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '') || '0'

function QuantityRow({ label, value, unit, tone = 'text-slate-700' }: { label: string; value: number; unit: string; tone?: string }) {
  if (value <= 0.000001) return null
  return <span className={`rounded-md bg-white px-2 py-1 text-[11px] shadow-sm ${tone}`}>{label} {numberText(value)} {unit}</span>
}

export default function WarehouseTwinDetailPanel({
  location,
  onOpenStocks,
}: {
  location: WarehouseTwinLocation | null
  onOpenStocks: () => void
}) {
  if (!location) {
    return <aside className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">选择一个库位查看库存明细。</aside>
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700"><MapPin size={15} /> {location.code}</div>
          <h3 className="mt-1 truncate text-xl font-semibold text-slate-950">{location.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{warehouseTwinStatusLabel(location.status)} · {location.materials.length} 种物料</p>
        </div>
        {location.isDefault && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">默认</span>}
      </div>

      <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {location.materials.map((material) => (
          <article key={material.stockId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-white p-2 text-slate-500 shadow-sm"><Box size={17} /></span>
              <div className="min-w-0">
                <div className="font-mono text-xs font-semibold text-blue-700">{material.code}</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{material.name}</div>
                {material.spec && <div className="mt-0.5 text-xs text-slate-500">{material.spec}</div>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <QuantityRow label="总量" value={material.qty} unit={material.unit} />
              <QuantityRow label="可用" value={material.availableQty} unit={material.unit} tone="text-emerald-700" />
              <QuantityRow label="待检" value={material.quarantineQty} unit={material.unit} tone="text-amber-700" />
              <QuantityRow label="冻结" value={material.holdQty} unit={material.unit} tone="text-red-700" />
              <QuantityRow label="返工" value={material.reworkQty} unit={material.unit} tone="text-violet-700" />
            </div>
          </article>
        ))}
        {location.materials.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">该库位当前没有库存</div>}
      </div>

      <AppButton fullWidth className="mt-5" onClick={onOpenStocks}>进入库存管理 <ArrowRight size={16} /></AppButton>
    </aside>
  )
}
