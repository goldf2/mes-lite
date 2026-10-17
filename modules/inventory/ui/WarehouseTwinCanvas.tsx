'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Maximize2, Minus, Plus, Warehouse } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WarehouseTwinLocation, WarehouseTwinStatus } from '../model/warehouse-digital-twin'
import { warehouseTwinLocationMatches } from '../model/warehouse-digital-twin'

const statusMeta: Record<WarehouseTwinStatus, { label: string; card: string; badge: string }> = {
  EMPTY: { label: '空库位', card: 'border-slate-200 bg-white', badge: 'bg-slate-100 text-slate-600' },
  AVAILABLE: { label: '可用', card: 'border-emerald-300 bg-emerald-50/80', badge: 'bg-emerald-100 text-emerald-700' },
  QUARANTINE: { label: '待检', card: 'border-amber-300 bg-amber-50/90', badge: 'bg-amber-100 text-amber-800' },
  HOLD: { label: '冻结', card: 'border-red-300 bg-red-50/90', badge: 'bg-red-100 text-red-700' },
  REWORK: { label: '返工', card: 'border-violet-300 bg-violet-50/90', badge: 'bg-violet-100 text-violet-700' },
}

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '') || '0'
const cardWidth = 248
const cardHeight = 166
const gap = 34
const padding = 72

export function warehouseTwinStatusLabel(status: WarehouseTwinStatus) {
  return statusMeta[status].label
}

export default function WarehouseTwinCanvas({
  locations,
  keyword,
  selectedLocationId,
  onSelectLocation,
  fillHeight = false,
  onOpenFullscreen,
}: {
  locations: WarehouseTwinLocation[]
  keyword: string
  selectedLocationId: string
  onSelectLocation: (locationId: string) => void
  fillHeight?: boolean
  onOpenFullscreen?: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const view = useRef({ x: 18, y: 18, zoom: 1 })
  const layer = useRef<HTMLDivElement>(null)
  const paintFrame = useRef<number | null>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null)
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, locations.length))))
  const canvasSize = useMemo(() => ({
    width: Math.max(980, padding * 2 + columns * cardWidth + Math.max(0, columns - 1) * gap),
    height: Math.max(580, padding * 2 + Math.ceil(locations.length / columns) * cardHeight + Math.max(0, Math.ceil(locations.length / columns) - 1) * gap),
  }), [columns, locations.length])

  // Pointer input only moves the composited layer; it does not re-render every stock card.
  const paintView = () => {
    if (paintFrame.current !== null) return
    paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = null
      const { x, y, zoom: scale } = view.current
      if (layer.current) layer.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    })
  }

  useEffect(() => () => {
    if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current)
    paintFrame.current = null
  }, [])

  const changeZoom = (value: number) => {
    view.current.zoom = Math.min(1.65, Math.max(0.55, Number(value.toFixed(2))))
    setZoom(view.current.zoom)
    paintView()
  }

  const resetView = () => {
    drag.current = null
    view.current = { x: 18, y: 18, zoom: 1 }
    paintView()
    setZoom(1)
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner ${fillHeight ? 'h-full min-h-[560px] xl:min-h-0' : 'h-[calc(100dvh-16rem)] min-h-[720px] max-h-[960px]'}`}>
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(#cbd5e1_1px,transparent_1px),linear-gradient(90deg,#cbd5e1_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute left-4 top-4 z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
        拖动空白处平移 · 点击库位查看详情
      </div>
      <div className="absolute right-4 top-4 z-20 flex gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <AppButton size="icon" aria-label="缩小白板" onClick={() => changeZoom(view.current.zoom - 0.15)}><Minus size={17} /></AppButton>
        <span className="flex min-w-14 items-center justify-center text-xs font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
        <AppButton size="icon" aria-label="放大白板" onClick={() => changeZoom(view.current.zoom + 0.15)}><Plus size={17} /></AppButton>
        <AppButton size="icon" aria-label="复位白板" onClick={resetView}><LocateFixed size={17} /></AppButton>
        {onOpenFullscreen && <AppButton size="icon" aria-label="全屏显示仓库白板" title="全屏显示" onClick={onOpenFullscreen}><Maximize2 size={17} /></AppButton>}
      </div>
      <div
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary || drag.current || event.target !== event.currentTarget) return
          event.preventDefault()
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: view.current.x, panY: view.current.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointerId !== event.pointerId) return
          view.current.x = drag.current.panX + event.clientX - drag.current.x
          view.current.y = drag.current.panY + event.clientY - drag.current.y
          paintView()
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null
        }}
      >
        <div
          ref={layer}
          className="pointer-events-none absolute left-0 top-0 will-change-transform"
          style={{ width: canvasSize.width, height: canvasSize.height, transform: 'translate3d(18px, 18px, 0) scale(1)', transformOrigin: '0 0' }}
        >
          <div className="absolute left-7 top-7 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm">
            <Warehouse size={18} /> 当前授权仓库
          </div>
          {locations.map((location, index) => {
            const row = Math.floor(index / columns)
            const column = index % columns
            const matches = warehouseTwinLocationMatches(location, keyword)
            const selected = location.id === selectedLocationId
            const status = statusMeta[location.status]
            const dimmed = Boolean(keyword) && !matches
            return (
              <button
                key={location.id}
                type="button"
                className={`pointer-events-auto absolute cursor-pointer overflow-hidden rounded-2xl border-2 p-4 text-left shadow-sm transition ${status.card} ${selected ? 'ring-4 ring-blue-300 ring-offset-2' : 'hover:-translate-y-0.5 hover:shadow-md'} ${dimmed ? 'opacity-20 grayscale' : 'opacity-100'}`}
                style={{ left: padding + column * (cardWidth + gap), top: padding + row * (cardHeight + gap), width: cardWidth, height: cardHeight }}
                onClick={() => onSelectLocation(location.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-semibold text-blue-700">{location.code}</div>
                    <div className="mt-1 truncate text-base font-semibold text-slate-900">{location.name}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status.badge}`}>{status.label}</span>
                </div>
                <div className="mt-3 text-xs text-slate-500">{location.materials.length} 种物料{location.isDefault ? ' · 默认库位' : ''}</div>
                <div className="mt-2 space-y-1.5">
                  {location.materials.slice(0, 3).map((material) => (
                    <div key={material.stockId} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                      <span className="min-w-0 truncate">{material.code} · {material.name}</span>
                      <span className="shrink-0 font-mono font-semibold">{numberText(material.qty)} {material.unit}</span>
                    </div>
                  ))}
                  {location.materials.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 py-3 text-center text-xs text-slate-400">当前无库存</div>}
                  {location.materials.length > 3 && <div className="text-[11px] text-slate-400">另有 {location.materials.length - 3} 种物料</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
