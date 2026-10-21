import { NextResponse, type NextRequest } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { getOrCreateWarehousePackageLabel } from '@/modules/inventory/server/warehouse-package-command-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return warehousePackageRoute(req, 'print', async ({ actorName, scope }) => {
    const data = await getOrCreateWarehousePackageLabel(params.id, actorName, scope)
    await writeAuditLog(req, { action: 'LABEL_PREVIEW', entityType: 'PACKAGE_DOCUMENT', entityId: params.id, entityLabel: data.qrValue, afterData: { labelRevisionId: data.id, contentVersion: data.contentVersion } })
    return NextResponse.json({ data })
  })
}
