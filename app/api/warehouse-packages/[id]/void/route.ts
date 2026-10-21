import { NextResponse, type NextRequest } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { voidWarehousePackageSchema } from '@/modules/inventory/contracts/warehouse-package-schema'
import { voidWarehousePackage } from '@/modules/inventory/server/warehouse-package-command-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return warehousePackageRoute(req, 'update', async ({ actorName, scope }) => {
    const { reason } = voidWarehousePackageSchema.parse(await req.json())
    const { before, updated } = await voidWarehousePackage(params.id, reason, actorName, scope)
    await writeAuditLog(req, { action: 'VOID', entityType: 'PACKAGE_DOCUMENT', entityId: updated.id, entityLabel: updated.packageNo, beforeData: before, afterData: updated, note: reason })
    return NextResponse.json({ data: updated })
  })
}
