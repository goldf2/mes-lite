import { NextResponse, type NextRequest } from 'next/server'
import { listWarehousePackingOptions } from '@/modules/inventory/server/warehouse-package-query-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'
export async function GET(req: NextRequest) {
  return warehousePackageRoute(req, 'read', async ({ scope }) => NextResponse.json({ data: await listWarehousePackingOptions(new URL(req.url).searchParams.get('keyword') || '', scope) }))
}
