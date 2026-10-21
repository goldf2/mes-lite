import { NextResponse, type NextRequest } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { createWarehousePackageSchema } from '@/modules/inventory/contracts/warehouse-package-schema'
import { createWarehousePackage } from '@/modules/inventory/server/warehouse-package-command-service'
import { listWarehousePackages } from '@/modules/inventory/server/warehouse-package-query-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  return warehousePackageRoute(req, params.get('availableForShipment') === 'true' ? 'ship' : 'read', async ({ scope }) => NextResponse.json({ data: await listWarehousePackages(params, scope) }))
}

export async function POST(req: NextRequest) {
  return warehousePackageRoute(req, 'update', async ({ actorName, scope }) => {
    const data = await createWarehousePackage(createWarehousePackageSchema.parse(await req.json()), actorName, scope)
    await writeAuditLog(req, { action: 'CREATE', entityType: 'PACKAGE_DOCUMENT', entityId: data.id, entityLabel: data.packageNo, afterData: data, note: '仓库装箱；不增加或扣减库存' })
    return NextResponse.json({ data }, { status: 201 })
  })
}
