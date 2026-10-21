import { NextResponse, type NextRequest } from 'next/server'
import { getWarehousePackage } from '@/modules/inventory/server/warehouse-package-query-service'
import { warehousePackageRoute } from '@/modules/inventory/server/warehouse-package-route'
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return warehousePackageRoute(req, 'read', async ({ scope }) => NextResponse.json({ data: await getWarehousePackage(params.id, scope) }))
}
