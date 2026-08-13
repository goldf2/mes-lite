import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireAnyResourcePermission, requireResourcePermission } from '@/lib/permissions'
import {
  inventoryLocationFieldsSchema,
  inventoryLocationIdSchema,
  inventoryLocationUpdateSchema,
} from '@/modules/configuration/contracts/inventory-location-schema'
import { InventoryLocationDomainError } from '@/modules/configuration/domain/inventory-location-errors'
import {
  archiveManagedInventoryLocation,
  createManagedInventoryLocation,
  updateManagedInventoryLocation,
} from '@/modules/configuration/server/inventory-location-command-service'
import { listManagedInventoryLocations } from '@/modules/configuration/server/inventory-location-query-service'
import { allowedInventoryLocationIds, loadEffectiveDataScope } from '@/modules/identity-access'

function locationHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof InventoryLocationDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const searchParams = new URL(req.url).searchParams
    const includeInactive = searchParams.get('includeInactive') === '1'
    const denied = includeInactive
      ? await requireResourcePermission('locations', 'read')
      : await requireAnyResourcePermission(['locations', 'materialIn', 'orders', 'productionActualEntry', 'stocks', 'shipment', 'return', 'flowTransfers'], 'read')
    if (denied) return denied
    const locations = await listManagedInventoryLocations(includeInactive)
    if (!searchParams.get('context')) return NextResponse.json({ data: locations })
    const allowedIds = allowedInventoryLocationIds(await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: allowedIds ? locations.filter((location) => allowedIds.includes(location.id)) : locations })
  } catch (error) {
    return locationHttpError(error, '获取库位失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('locations', 'create')
    if (denied) return denied
    const saved = await createManagedInventoryLocation(inventoryLocationFieldsSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedInventoryLocations(true) }, { status: 201 })
  } catch (error) {
    return locationHttpError(error, '新增库位失败')
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('locations', 'update')
    if (denied) return denied
    const { existing, saved } = await updateManagedInventoryLocation(inventoryLocationUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedInventoryLocations(true) })
  } catch (error) {
    return locationHttpError(error, '更新库位失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('locations', 'delete')
    if (denied) return denied
    const id = inventoryLocationIdSchema.parse(new URL(req.url).searchParams.get('id'))
    const { existing, saved } = await archiveManagedInventoryLocation(id)
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'INVENTORY_LOCATION', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return NextResponse.json({ data: await listManagedInventoryLocations(true) })
  } catch (error) {
    return locationHttpError(error, '归档库位失败')
  }
}
