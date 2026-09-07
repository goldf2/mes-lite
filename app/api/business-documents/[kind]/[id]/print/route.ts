import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import type { BusinessDocumentKind } from '@/modules/business-documents/contracts/business-document'
import { businessDocumentDefinition } from '@/modules/business-documents/domain/business-document-definition'
import {
  businessDocumentHttpError,
  businessDocumentPdfResponse,
} from '@/modules/business-documents/http/business-document-http'
import {
  hasArchivedBusinessDocumentPdf,
  resolveBusinessDocumentPdf,
} from '@/modules/business-documents/server/business-document-print-service'
import {
  hasArchivedShipmentDocumentPdf,
  resolveShipmentDocumentPdf,
  shipmentDocumentAudiences,
  type ShipmentDocumentAudience,
} from '@/modules/sales/server-index'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { kind: string; id: string } },
) {
  const definition = businessDocumentDefinition(params.kind)
  if (!definition) return NextResponse.json({ error: '不支持的单据类型' }, { status: 404 })
  const kind = params.kind as BusinessDocumentKind

  try {
    const denied = await requireResourcePermission(definition.permissionResource, 'read')
    if (denied) return denied
    const searchParams = new URL(request.url).searchParams
    const regenerate = searchParams.get('regenerate') === '1'
    const download = searchParams.get('download') === '1'
    const audienceValue = searchParams.get('audience') || 'customer'
    if (kind === 'shipment' && !shipmentDocumentAudiences.includes(audienceValue as ShipmentDocumentAudience)) {
      return NextResponse.json({ error: '不支持的发货单输出类型' }, { status: 400 })
    }
    const audience = kind === 'shipment' ? audienceValue as ShipmentDocumentAudience : undefined
    const operator = kind === 'shipment' ? await getCurrentOperator() : null
    if (kind === 'shipment' && !operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const scope = operator ? await loadEffectiveDataScope(operator) : undefined
    if (regenerate) {
      const hasArchive = kind === 'shipment'
        ? await hasArchivedShipmentDocumentPdf(params.id, audience || 'customer')
        : await hasArchivedBusinessDocumentPdf(kind, params.id)
      const generationDenied = await requireResourcePermission(
        definition.permissionResource,
        hasArchive ? 'update' : 'create',
      )
      if (generationDenied) return generationDenied
    }
    const result = kind === 'shipment'
      ? await resolveShipmentDocumentPdf(params.id, { audience: audience || 'customer', regenerate, scope })
      : await resolveBusinessDocumentPdf(kind, params.id, regenerate)
    return businessDocumentPdfResponse(result.pdf, result.filename, { disposition: download ? 'attachment' : 'inline' })
  } catch (error) {
    if (error instanceof SalesDomainError || error instanceof DataScopeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return businessDocumentHttpError(error)
  }
}
