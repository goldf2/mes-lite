import { prisma } from '@/lib/prisma'
import {
  assertInventoryLocationDataScope,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import type { CreateShipmentPackageCommand } from '../contracts/shipment-package-schema'
import { datedDocumentPrefix, nextDatedDocumentNo } from '../domain/sales-document-numbering'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { shipmentPackageInclude } from './shipment-package-query-service'

const quantityTolerance = 0.000001

export async function createShipmentPackage(
  shipmentId: string,
  input: CreateShipmentPackageCommand,
  actorName: string,
  now = new Date(),
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({
      where: { id: shipmentId, deletedAt: null },
      include: { items: { include: { material: { select: { id: true, code: true, stockUnit: true } }, location: true } } },
    })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    assertInventoryLocationDataScope(scope, shipment.items.map((item) => item.locationId))
    if (shipment.status !== 'PENDING') throw new SalesDomainError('只有待发货单可以新增货箱')

    const shipmentItem = shipment.items.find((item) => item.id === input.shipmentItemId)
    if (!shipmentItem) throw new SalesDomainError('所选发货明细不属于当前发货单', 404)

    const packed = await tx.packageDocumentItem.aggregate({
      where: { shipmentItemId: shipmentItem.id, packageDocument: { is: { shipmentId, deletedAt: null } } },
      _sum: { quantity: true },
    })
    const remainingQty = Number((Number(shipmentItem.qty) - Number(packed._sum.quantity || 0)).toFixed(6))
    if (input.quantity > remainingQty + quantityTolerance) {
      throw new SalesDomainError(`装箱数量超过明细未装数量 ${remainingQty} ${shipmentItem.unitSnapshot}`)
    }

    const latest = await tx.packageDocument.findFirst({
      where: { packageNo: { startsWith: datedDocumentPrefix('BX', now) } },
      orderBy: { packageNo: 'desc' },
      select: { packageNo: true },
    })
    return tx.packageDocument.create({
      data: {
        packageNo: nextDatedDocumentNo('BX', now, latest?.packageNo),
        shipmentId,
        packedBy: input.packedBy?.trim() || actorName,
        packedAt: now,
        grossWeight: input.grossWeight,
        netWeight: input.netWeight,
        weightUnit: input.weightUnit,
        lengthMm: input.lengthMm,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
        sealNo: input.sealNo || null,
        note: input.note || null,
        items: {
          create: {
            shipmentItemId: shipmentItem.id,
            materialId: shipmentItem.materialId,
            quantity: input.quantity,
            unitSnapshot: shipmentItem.unitSnapshot,
          },
        },
      },
      include: shipmentPackageInclude,
    })
  }))
}

export async function archiveShipmentPackage(
  shipmentId: string,
  packageId: string,
  actorName: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const packageDocument = await tx.packageDocument.findFirst({
      where: { id: packageId, shipmentId, deletedAt: null },
      include: { shipment: { include: { items: { select: { locationId: true } } } } },
    })
    if (!packageDocument) throw new SalesDomainError('货箱单据不存在', 404)
    assertInventoryLocationDataScope(scope, packageDocument.shipment.items.map((item) => item.locationId))
    if (packageDocument.shipment.status !== 'PENDING') throw new SalesDomainError('已发货货箱不可归档')
    const updated = await tx.packageDocument.update({
      where: { id: packageId },
      data: { status: 'ARCHIVED', deletedAt: new Date(), deletedBy: actorName },
    })
    return { before: packageDocument, updated }
  }))
}
