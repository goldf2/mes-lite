'use client'

import JsBarcode from 'jsbarcode'
import { useEffect, useRef } from 'react'
import type { LabelData } from '../contracts/scan-print'
import type { LabelMediaProfile } from '../model/label-profiles'
import { formatScanQuantity } from '../model/scan-print-view'

export default function GenericLabel({ data, media }: { data: LabelData; media: LabelMediaProfile }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null)
  const compact = media.heightMm <= 80

  useEffect(() => {
    if (!barcodeRef.current || !data.code.trim()) return
    JsBarcode(barcodeRef.current, data.code.trim(), {
      format: 'CODE128',
      width: compact ? 1.5 : 2,
      height: compact ? 48 : 76,
      displayValue: false,
      margin: 0,
    })
  }, [compact, data.code])

  return (
    <section className="shipment-label-sheet" style={{ width: `${media.widthMm}mm`, height: `${media.heightMm}mm`, padding: compact ? '4mm' : '6mm' }}>
      <div className={`border-b-2 border-black ${compact ? 'pb-2' : 'pb-3'}`}>
        <div className={`${compact ? 'text-[10px]' : 'text-[12px]'} font-semibold tracking-[0.18em]`}>{data.title || 'MES-lite 标签'}</div>
        <div className={`${compact ? 'mt-1 text-[16px]' : 'mt-2 text-[19px]'} font-mono font-bold`}>{data.code || 'NO-CODE'}</div>
      </div>
      {compact ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44mm] gap-4 pt-3">
          <div className="flex min-w-0 flex-col">
            <div className="text-[9px] text-gray-600">名称</div>
            <div className="mt-0.5 line-clamp-2 text-[18px] font-black leading-tight">{data.name || '标签打印校准'}</div>
            {data.spec && <div className="mt-1 line-clamp-2 text-[11px]">{data.spec}</div>}
            <div className="mt-2 border-y border-black py-1.5">
              <span className="text-[9px] text-gray-600">数量 </span>
              <span className="text-[22px] font-black">{formatScanQuantity(data.quantity)} </span>
              <span className="text-[12px]">{data.unit}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 text-[9px] leading-tight">{data.note || `PC310T 203 dpi · ${media.label}`}</div>
          </div>
          <div className="flex min-w-0 flex-col justify-end text-center">
            {data.code.trim() ? <svg ref={barcodeRef} className="mx-auto max-h-[18mm] max-w-full" /> : <div className="h-[18mm]" />}
            <div className="mt-1 truncate font-mono text-[10px] font-semibold tracking-wide">{data.code || 'NO-CODE'}</div>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-rows-[auto_auto_1fr_auto] gap-4 py-4">
          <div>
            <div className="text-[10px] text-gray-600">名称</div>
            <div className="mt-1 text-[22px] font-black leading-tight">{data.name || '标签打印校准'}</div>
            {data.spec && <div className="mt-2 text-[13px]">{data.spec}</div>}
          </div>
          <div className="border-y border-black py-4">
            <div className="text-[10px] text-gray-600">数量</div>
            <div className="mt-1 text-[32px] font-black">{formatScanQuantity(data.quantity)} <span className="text-[16px]">{data.unit}</span></div>
          </div>
          <div className="text-[13px] leading-relaxed">{data.note || `PC310T 203 dpi · ${media.label}`}</div>
          <div className="text-center">
            {data.code.trim() ? <svg ref={barcodeRef} className="mx-auto max-h-[26mm] max-w-full" /> : <div className="h-[26mm]" />}
            <div className="mt-2 font-mono text-[13px] font-semibold tracking-wider">{data.code || 'NO-CODE'}</div>
          </div>
        </div>
      )}
    </section>
  )
}
