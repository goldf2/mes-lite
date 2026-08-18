'use client'

import QRCode from 'qrcode'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { LabelMediaProfile } from '../model/label-profiles'

export type DocumentQrLabelData = {
  title: string
  code: string
  description: string
  details: string[]
}

export default function DocumentQrLabel({ data, media }: { data: DocumentQrLabelData; media: LabelMediaProfile }) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    QRCode.toDataURL(data.code, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 720,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [data.code])

  return (
    <section className="shipment-label-sheet" style={{ width: `${media.widthMm}mm`, height: `${media.heightMm}mm`, padding: '4mm' }}>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-gray-700">MES-lite 可扫码单据</div>
          <div className="mt-2 line-clamp-2 text-[20px] font-black leading-tight">{data.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-tight text-gray-700">{data.description}</div>
          <div className="mt-3 border-y border-black py-2 font-mono text-[16px] font-bold">{data.code}</div>
          <ul className="mt-2 space-y-1 text-[9px] leading-tight">
            {data.details.filter(Boolean).slice(0, 4).map((detail) => <li key={detail} className="line-clamp-1">{detail}</li>)}
          </ul>
          <div className="mt-auto text-[8px] text-gray-500">扫码查看系统单据；物流运单号与本码分开管理。</div>
        </div>
        <div className="flex w-[43mm] shrink-0 flex-col items-center justify-center border-l border-black pl-4">
          {qrDataUrl ? <Image src={qrDataUrl} alt="单据二维码" width={144} height={144} unoptimized className="h-[38mm] w-[38mm]" /> : <div className="h-[38mm] w-[38mm] border border-dashed border-gray-400" />}
          <div className="mt-1 max-w-full truncate font-mono text-[9px] font-semibold">{data.code}</div>
        </div>
      </div>
    </section>
  )
}
