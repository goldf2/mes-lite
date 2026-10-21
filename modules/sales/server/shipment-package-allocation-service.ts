import type { Prisma } from '@prisma/client'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { SalesDomainError } from '../domain/sales-errors'

export async function loadShipmentWarehousePackages(tx: Prisma.TransactionClient, packageIds: string[], customerId: string, scope: EffectiveDataScope) {
  if (new Set(packageIds).size !== packageIds.length) throw new SalesDomainError('同一货箱不能重复添加')
  const packages = await tx.packageDocument.findMany({
    where: { id: { in: packageIds }, sourceType: 'WAREHOUSE', deletedAt: null },
    include: { placement: { include: { location: true } }, items: { include: { material: true, inventoryLot: true } }, allocations: { where: { status: { in: ['RESERVED', 'SHIPPED'] } } } },
  })
  if (packages.length !== packageIds.length) throw new SalesDomainError('部分货箱不存在或不是可发货的仓库装箱记录', 404)
  for (const box of packages) {
    if (box.status !== 'PACKED' || box.allocations.length) throw new SalesDomainError(`货箱 ${box.packageNo} 已占用、已发货或已作废`, 409)
    if (!box.placement || box.items.length !== 1) throw new SalesDomainError(`货箱 ${box.packageNo} 缺少可信位置或箱内明细`, 409)
    assertInventoryLocationDataScope(scope, [box.placement.locationId])
    if (box.placement.location.deletedAt || !box.placement.location.isActive) throw new SalesDomainError(`货箱 ${box.packageNo} 所在库位已停用`)
    for (const item of box.items) {
      if (!item.inventoryLot || item.inventoryLot.status !== 'OPEN' || item.inventoryLot.materialId !== item.materialId || item.quantity <= 0 || item.inventoryStatus !== 'AVAILABLE' || item.material.deletedAt) throw new SalesDomainError(`货箱 ${box.packageNo} 缺少可发货的真实库存批次`, 409)
      if (item.material.customerId && item.material.customerId !== customerId) throw new SalesDomainError(`货箱 ${box.packageNo} 的产品不属于所选客户`)
    }
  }
  return packages
}

export async function reserveShipmentWarehousePackage(tx: Prisma.TransactionClient, box: { id: string; revision: number; contentVersion: number; packageNo: string }, shipmentId: string, actorName: string) {
  const locked = await tx.packageDocument.updateMany({
    where: { id: box.id, revision: box.revision, sourceType: 'WAREHOUSE', status: 'PACKED', deletedAt: null, allocations: { none: { status: { in: ['RESERVED', 'SHIPPED'] } } } },
    data: { revision: { increment: 1 } },
  })
  if (locked.count !== 1) throw new SalesDomainError(`货箱 ${box.packageNo} 已被其他操作占用，请刷新`, 409)
  return tx.shipmentPackageAllocation.create({ data: { shipmentId, packageDocumentId: box.id, contentVersion: box.contentVersion, reservedBy: actorName, status: 'RESERVED' } })
}

export async function releaseShipmentWarehousePackages(tx: Prisma.TransactionClient, shipmentId: string) {
  await tx.shipmentItemSource.updateMany({ where: { shipmentItem: { shipmentId }, status: 'RESERVED' }, data: { status: 'RELEASED' } })
  await tx.shipmentPackageAllocation.updateMany({ where: { shipmentId, status: 'RESERVED' }, data: { status: 'RELEASED', releasedAt: new Date() } })
}

export async function shipmentPackageIdsByItem(tx: Prisma.TransactionClient, shipmentId: string) {
  const allocations = await tx.shipmentPackageAllocation.findMany({
    where: { shipmentId, status: 'RESERVED' },
    include: { packageDocument: { include: { placement: true, items: true } }, sources: { include: { shipmentItem: true } } },
  })
  const result = new Map<string, string[]>()
  for (const allocation of allocations) {
    const box = allocation.packageDocument
    if (box.deletedAt || box.status !== 'PACKED' || box.contentVersion !== allocation.contentVersion || !box.placement || box.items.length !== 1) throw new SalesDomainError(`货箱 ${box.packageNo} 内容或位置发生变化，不能确认发货`, 409)
    for (const content of box.items) {
      const sources = allocation.sources.filter((source) => source.packageDocumentItemId === content.id && source.status === 'RESERVED')
      if (sources.length !== 1 || Math.abs(Number(sources[0].quantity) - Number(content.quantity)) > 0.000001 || sources[0].inventoryLotId !== content.inventoryLotId || sources[0].locationId !== box.placement.locationId || sources[0].shipmentItem.locationId !== box.placement.locationId || sources[0].shipmentItem.materialId !== content.materialId) throw new SalesDomainError(`货箱 ${box.packageNo} 发货来源不一致，不能确认`, 409)
      const ids = result.get(sources[0].shipmentItemId) || []
      ids.push(box.id)
      result.set(sources[0].shipmentItemId, ids)
    }
  }
  return { allocations, byItem: result }
}
