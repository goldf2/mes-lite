import { NextResponse, type NextRequest } from 'next/server'
import { resolveWarehousePackage } from '@/modules/inventory/server/warehouse-package-query-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const available = params.get('available') === 'true'
  return warehousePackageRoute(req, available ? 'ship' : 'read', async ({ scope }) => NextResponse.json({ data: await resolveWarehousePackage(params.get('code') || '', available, scope) }))
}
