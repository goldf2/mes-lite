import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicShipmentDocumentPdf, SalesDomainError } from '@/modules/sales/server-index'
import { businessDocumentPdfResponse } from '@/modules/business-documents/http/business-document-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { pdf, filename } = await resolvePublicShipmentDocumentPdf(params.id)
    const response = businessDocumentPdfResponse(pdf, filename, { disposition: 'attachment' })
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    const status = error instanceof SalesDomainError ? error.status : 500
    const message = error instanceof SalesDomainError ? error.message : '下载发货单电子档失败，请稍后重试。'
    return new NextResponse(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>发货单电子档</title></head><body style="margin:0;background:#f8fafc;color:#334155;font-family:system-ui,sans-serif"><main style="max-width:420px;margin:15vh auto;padding:32px 24px"><h1 style="font-size:24px">发货单电子档不可用</h1><p style="font-size:18px;line-height:1.7">${message}</p><p>如需核实单据，请联系发货方。</p></main></body></html>`, {
      status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
    })
  }
}
