import { prisma } from '@/lib/prisma'
import {
  assertInventoryLocationDataScope,
  shipmentDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { SalesDomainError } from '../domain/sales-errors'

export const shipmentPackageInclude = {
  items: {
    include: {
      material: { select: { id: true, code: true, name: true, spec: true } },
      shipmentItem: { select: { id: true, sortOrder: true, unitSnapshot: true } },
      inventoryLot: { select: { id: true, lotNo: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

export async function listShipmentPackages(
  shipmentId: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, deletedAt: null, ...shipmentDataScopeWhere(scope) },
    select: { id: true, items: { select: { locationId: true } } },
  })
  if (!shipment) throw new SalesDomainError('发货单不存在或无权访问', 404)
  assertInventoryLocationDataScope(scope, shipment.items.map((item) => item.locationId))
  return prisma.packageDocument.findMany({
    where: { shipmentId, deletedAt: null },
    include: shipmentPackageInclude,
    orderBy: [{ packedAt: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function getShipmentPackage(
  shipmentId: string,
  packageId: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const packageDocument = await prisma.packageDocument.findFirst({
    where: {
      id: packageId,
      shipmentId,
      deletedAt: null,
      shipment: { is: { deletedAt: null, ...shipmentDataScopeWhere(scope) } },
    },
    include: { ...shipmentPackageInclude, shipment: { select: { shipmentNo: true, items: { select: { locationId: true } } } } },
  })
  if (!packageDocument) throw new SalesDomainError('货箱单据不存在或无权访问', 404)
  assertInventoryLocationDataScope(scope, packageDocument.shipment.items.map((item) => item.locationId))
  return packageDocument
}
