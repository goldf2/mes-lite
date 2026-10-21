import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { packagePersonnel, warehousePackageCode, WarehousePackageError } from '../domain/warehouse-package'
import { getPackedInventoryQuantity } from './warehouse-package-stock-service'
import { warehousePackingLotInclude, warehousePackingProvenance } from './warehouse-package-provenance-service'

export const warehousePackageInclude = {
  items: { include: { material: { select: { id: true, code: true, name: true, spec: true, stockUnit: true, customerId: true } } }, orderBy: { createdAt: 'asc' as const } },
  placement: { include: { location: { select: { id: true, code: true, name: true } } } },
  labelRevisions: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  allocations: { where: { status: { in: ['RESERVED', 'SHIPPED'] } }, include: { shipment: { select: { id: true, shipmentNo: true } } }, orderBy: { reservedAt: 'desc' as const }, take: 1 },
} satisfies Prisma.PackageDocumentInclude

type WarehousePackageRecord = Prisma.PackageDocumentGetPayload<{ include: typeof warehousePackageInclude }>

export function warehousePackageScopeWhere(scope: EffectiveDataScope): Prisma.PackageDocumentWhereInput {
  return scope.inventoryMode === 'ALL' ? {} : { placement: { is: { locationId: { in: scope.locationIds } } } }
}

export function serializeWarehousePackage(value: WarehousePackageRecord) {
  const revision = value.labelRevisions[0]
  const allocation = value.allocations[0]
  return {
    ...value,
    status: value.status === 'PACKED' && allocation?.status === 'RESERVED' ? 'RESERVED' : value.status,
    productionPersonnel: packagePersonnel(value.productionPersonnel),
    qualityPersonnel: packagePersonnel(value.qualityPersonnel),
    placement: value.placement ? { ...value.placement, positionXmm: value.placement.xMm, positionYmm: value.placement.yMm, positionZmm: value.placement.zMm, version: value.placement.revision } : null,
    labelRevision: revision ? { id: revision.id, contentVersion: revision.contentVersion, qrValue: `${value.packageNo}#v${revision.contentVersion}`, createdAt: revision.createdAt } : null,
    shipmentAllocation: allocation ? { shipmentId: allocation.shipmentId, shipmentNo: allocation.shipment.shipmentNo, status: allocation.status } : null,
    allocations: undefined, labelRevisions: undefined,
  }
}

export async function getWarehousePackage(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const value = await prisma.packageDocument.findFirst({
    where: { id, sourceType: 'WAREHOUSE', ...warehousePackageScopeWhere(scope) }, include: warehousePackageInclude,
  })
  if (!value) throw new WarehousePackageError('装箱记录不存在或无权访问', 404)
  if (!value.placement) throw new WarehousePackageError('装箱记录缺少可信库位，请先核实', 409)
  assertInventoryLocationDataScope(scope, [value.placement.locationId])
  return serializeWarehousePackage(value)
}

export async function resolveWarehousePackage(raw: string, available: boolean, scope: EffectiveDataScope = unrestrictedDataScope) {
  const parsed = warehousePackageCode(raw)
  if (!parsed) throw new WarehousePackageError('请输入有效的装箱编号或扫描箱签', 400)
  const value = await prisma.packageDocument.findFirst({
    where: { packageNo: parsed.packageNo, sourceType: 'WAREHOUSE', ...warehousePackageScopeWhere(scope) }, include: warehousePackageInclude,
  })
  if (!value) throw new WarehousePackageError('未找到该装箱记录或无权访问', 404)
  if (parsed.contentVersion != null && parsed.contentVersion !== value.contentVersion) throw new WarehousePackageError('该标签内容版本已失效，请使用当前标签', 409)
  if (available && (value.deletedAt || value.status !== 'PACKED' || value.allocations.length > 0)) throw new WarehousePackageError('该箱已占用、已发货或已作废，不能再次加入发货单', 409)
  if (available) {
    const eligible = await prisma.packageDocument.count({ where: { id: value.id, placement: { is: { location: { is: { deletedAt: null, isActive: true } } } }, items: { some: {}, every: { inventoryStatus: 'AVAILABLE', inventoryLot: { is: { status: 'OPEN' } }, material: { is: { deletedAt: null } } } } } })
    if (eligible !== 1) throw new WarehousePackageError('该箱的产品批次、质量状态或库位当前不可发货', 409)
  }
  return serializeWarehousePackage(value)
}

export async function listWarehousePackages(params: URLSearchParams, scope: EffectiveDataScope = unrestrictedDataScope) {
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(params.get('pageSize')) || 20)))
  const keyword = (params.get('keyword') || '').trim().slice(0, 100)
  const status = params.get('status') || ''
  const available = params.get('availableForShipment') === 'true'
  const customerId = params.get('customerId')?.trim()
  const where: Prisma.PackageDocumentWhereInput = {
    sourceType: 'WAREHOUSE', ...warehousePackageScopeWhere(scope),
    ...(available && customerId ? { items: { every: { material: { is: { OR: [{ customerId: null }, { customerId }] } } } } } : {}),
    ...(available || status === 'PACKED' ? { deletedAt: null, status: 'PACKED', allocations: { none: { status: { in: ['RESERVED', 'SHIPPED'] } } } } : status === 'RESERVED' ? { status: 'PACKED', allocations: { some: { status: 'RESERVED' } } } : status ? { status } : {}),
    ...(keyword ? { OR: [{ packageNo: { contains: keyword } }, { items: { some: { material: { is: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }, { spec: { contains: keyword } }] } } } } }, { items: { some: { lotNoSnapshot: { contains: keyword } } } }] } : {}),
  }
  if (available) {
    where.AND = [
      { placement: { is: { location: { is: { deletedAt: null, isActive: true } } } } },
      { items: { some: {}, every: { inventoryStatus: 'AVAILABLE', inventoryLot: { is: { status: 'OPEN' } }, material: { is: { deletedAt: null } } } } },
    ]
  }
  const [items, total] = await prisma.$transaction([prisma.packageDocument.findMany({ where, include: warehousePackageInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), prisma.packageDocument.count({ where })])
  return { items: items.map(serializeWarehousePackage), total, page, pageSize }
}

export async function warehouseUnpackedQuantity(tx: Prisma.TransactionClient, lotId: string, materialId: string, locationId: string) {
  const [lotBalance, stock, location, packedLot, packedMaterial, packedLocation] = await Promise.all([
    tx.inventoryLotBalance.findUnique({ where: { lotId_locationId_inventoryStatus: { lotId, locationId, inventoryStatus: 'AVAILABLE' } } }),
    tx.stock.findUnique({ where: { materialId } }),
    tx.stockLocationBalance.findFirst({ where: { stock: { materialId }, locationId } }),
    getPackedInventoryQuantity(tx, { inventoryLotId: lotId, locationId }),
    getPackedInventoryQuantity(tx, { materialId }),
    getPackedInventoryQuantity(tx, { materialId, locationId }),
  ])
  return Math.max(0, Number(Math.min(Number(lotBalance?.stockQty || 0) - packedLot, Number(stock?.availableQty || 0) - packedMaterial, Number(location?.availableQty || 0) - packedLocation).toFixed(6)))
}

export async function listWarehousePackingOptions(keyword: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const token = keyword.trim().slice(0, 100)
  return prisma.$transaction(async (tx) => {
    const balances = await tx.inventoryLotBalance.findMany({
      where: {
        inventoryStatus: 'AVAILABLE', stockQty: { gt: 0.000001 },
        ...(scope.inventoryMode === 'ALL' ? {} : { locationId: { in: scope.locationIds } }),
        location: { is: { deletedAt: null } },
        lot: { is: { status: 'OPEN', NOT: { sourceType: { startsWith: 'LEGACY' } }, material: { is: { deletedAt: null } }, ...(token ? { OR: [{ lotNo: { contains: token } }, { material: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }, { spec: { contains: token } }] } } }] } : {}) } },
      },
      include: { lot: { include: warehousePackingLotInclude }, location: { select: { id: true, code: true, name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 100,
    })
    const result = []
    for (const balance of balances) {
      const unpackedQty = await warehouseUnpackedQuantity(tx, balance.lotId, balance.lot.materialId, balance.locationId)
      if (unpackedQty <= 0.000001) continue
      const provenance = warehousePackingProvenance(balance.lot)
      result.push({ inventoryLotId: balance.lotId, lotNo: balance.lot.lotNo, materialId: balance.lot.materialId, material: balance.lot.material, locationId: balance.locationId, location: balance.location, unpackedQty, productionPersonnel: provenance.productionPersonnel, qualityPersonnel: provenance.qualityPersonnel })
    }
    return result
  })
}
