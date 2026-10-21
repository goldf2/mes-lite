import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { assertInventoryLocationDataScope, shipmentDataScopeWhere, type EffectiveDataScope } from '@/modules/identity-access'
import type { UpdateShipmentDraftCommand } from '../contracts/fulfillment-schema'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { prepareShipmentItems } from './fulfillment-command-service'
import { reserveShipmentWarehousePackage } from './shipment-package-allocation-service'

const itemKey = (item: { materialId: string; locationId: string }) => `${item.materialId}:${item.locationId}`

export async function updateShipmentDraft(id: string, input: UpdateShipmentDraftCommand, scope: EffectiveDataScope, audit: AuditContext, actorName: string) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.shipment.findFirst({
      where: { id, deletedAt: null, ...shipmentDataScopeWhere(scope) },
      include: {
        items: { include: { goodsSources: true, packageItems: { include: { packageDocument: { select: { packageNo: true, deletedAt: true } } } } }, orderBy: { sortOrder: 'asc' } },
        packageAllocations: { where: { status: 'RESERVED' } },
      },
    })
    if (!current) throw new SalesDomainError('发货单不存在、已归档或无权访问', 404)
    assertInventoryLocationDataScope(scope, current.items.map((item) => item.locationId))
    if (current.status !== 'PENDING') throw new SalesDomainError('只有待发货单可以修改商品和货箱；确认发货后内容已冻结', 409)
    if (current.items.some((item) => item.goodsSources.some((source) => source.status !== 'RESERVED'))) throw new SalesDomainError('发货来源状态异常，请先核实单据', 409)
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const locked = await tx.shipment.updateMany({
      where: { id, status: 'PENDING', deletedAt: null, updatedAt: new Date(input.updatedAt) },
      data: { updatedAt },
    })
    if (locked.count !== 1) throw new SalesDomainError('发货单已发生变化，请刷新后重新编辑', 409)

    const currentByKey = new Map(current.items.map((item) => [itemKey(item), item]))
    const { customer, prepared, packages } = await prepareShipmentItems(tx, input, scope, {
      ownShipmentId: id,
      currentPrices: new Map(current.items.map((item) => [itemKey(item), item.unitPrice])),
    })
    for (const item of current.items) {
      const packedQty = item.packageItems.filter((boxItem) => !boxItem.packageDocument.deletedAt).reduce((sum, boxItem) => sum + Number(boxItem.quantity), 0)
      const next = prepared.find((row) => itemKey(row) === itemKey(item))
      if (packedQty > (next?.looseQty || 0) + 0.000001) throw new SalesDomainError('该商品已有发货单内货箱，请先移除对应货箱，再删除商品、修改库位或减少数量', 409)
    }
    const wantedBoxIds = new Set(packages.map((box) => box.id))
    const removedAllocationIds = current.packageAllocations.filter((allocation) => !wantedBoxIds.has(allocation.packageDocumentId)).map((allocation) => allocation.id)
    if (removedAllocationIds.length) await tx.shipmentPackageAllocation.updateMany({
      where: { id: { in: removedAllocationIds }, status: 'RESERVED' }, data: { status: 'RELEASED', releasedAt: updatedAt },
    })
    const allocationIds = new Map(current.packageAllocations.filter((allocation) => wantedBoxIds.has(allocation.packageDocumentId)).map((allocation) => [allocation.packageDocumentId, allocation.id]))
    for (const box of packages) {
      if (!allocationIds.has(box.id)) allocationIds.set(box.id, (await reserveShipmentWarehousePackage(tx, box, id, actorName)).id)
    }

    // Draft sources describe the current composition; their previous state is captured in the audit below.
    await tx.shipmentItemSource.deleteMany({ where: { shipmentItem: { shipmentId: id } } })
    const retainedItemIds: string[] = []
    for (let sortOrder = 0; sortOrder < prepared.length; sortOrder += 1) {
      const item = prepared[sortOrder]
      const values = { sortOrder, materialId: item.materialId, locationId: item.locationId, qty: item.qty, unitSnapshot: item.unitSnapshot, unitPrice: item.unitPrice, totalAmount: item.totalAmount }
      const previous = currentByKey.get(itemKey(item))
      const saved = previous
        ? await tx.shipmentItem.update({ where: { id: previous.id }, data: values })
        : await tx.shipmentItem.create({ data: { shipmentId: id, ...values } })
      retainedItemIds.push(saved.id)
      if (item.looseQty > 0) await tx.shipmentItemSource.create({ data: { shipmentItemId: saved.id, sourceType: 'LOOSE', locationId: item.locationId, quantity: item.looseQty } })
      for (const box of item.boxItems) await tx.shipmentItemSource.create({ data: {
        shipmentItemId: saved.id, sourceType: 'BOX', allocationId: allocationIds.get(box.packageId)!, packageDocumentItemId: box.packageItemId,
        inventoryLotId: box.inventoryLotId, locationId: item.locationId, quantity: box.quantity,
      } })
    }
    const removedItemIds = current.items.filter((item) => !retainedItemIds.includes(item.id)).map((item) => item.id)
    if (removedItemIds.length) {
      // Archived legacy boxes retain their product/quantity snapshots without pointing at a removed draft line.
      await tx.packageDocumentItem.updateMany({ where: { shipmentItemId: { in: removedItemIds }, packageDocument: { deletedAt: { not: null } } }, data: { shipmentItemId: null } })
      await tx.shipmentItem.deleteMany({ where: { id: { in: removedItemIds } } })
    }
    const first = prepared[0]
    const updated = await tx.shipment.update({
      where: { id }, data: {
        productId: first.productId, materialId: first.materialId, locationId: first.locationId,
        customerId: customer.id, customer: customer.name, customerPhone: customer.phone, address: customer.address,
        qty: prepared.reduce((sum, item) => sum + item.qty, 0),
        unitPrice: prepared.length === 1 ? first.unitPrice : 0,
        totalAmount: prepared.reduce((sum, item) => sum + item.totalAmount, 0),
        voucherNo: input.voucherNo?.trim() || null, trackingNo: input.trackingNo?.trim() || null,
        note: input.note?.trim() || null, shippedBy: input.shippedBy?.trim() || null, updatedAt,
      }, include: { items: { orderBy: { sortOrder: 'asc' } }, packageAllocations: { where: { status: 'RESERVED' } } },
    })
    await createAuditLog(tx, audit, {
      action: 'UPDATE', entityType: 'SHIPMENT', entityId: id, entityLabel: current.shipmentNo,
      beforeData: current, afterData: { ...updated, editMode: 'draft' },
    })
    return { id: updated.id, shipmentNo: updated.shipmentNo, updatedAt: updated.updatedAt }
  }))
}
