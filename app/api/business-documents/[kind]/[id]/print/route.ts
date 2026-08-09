import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
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
    const regenerate = new URL(request.url).searchParams.get('regenerate') === '1'
    if (regenerate) {
      const hasArchive = await hasArchivedBusinessDocumentPdf(kind, params.id)
      const generationDenied = await requireResourcePermission(
        definition.permissionResource,
        hasArchive ? 'update' : 'create',
      )
      if (generationDenied) return generationDenied
    }
    const result = await resolveBusinessDocumentPdf(kind, params.id, regenerate)
    return businessDocumentPdfResponse(result.pdf, result.filename)
  } catch (error) {
    return businessDocumentHttpError(error)
  }
}
