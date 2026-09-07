import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { createShipmentDeliveryNote } from '@/modules/sales/server/shipment-delivery-note-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { businessDocumentPdfResponse } from '@/modules/business-documents/http/business-document-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { pdf, filename } = await createShipmentDeliveryNote(params.id, await loadEffectiveDataScope(operator))
    const disposition = new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    return businessDocumentPdfResponse(pdf, filename, { disposition })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Generate shipment PDF error:', error)
    return NextResponse.json({ error: '生成发货单 PDF 失败' }, { status: 500 })
  }
}
