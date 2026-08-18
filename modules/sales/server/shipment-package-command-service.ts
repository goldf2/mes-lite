import { prisma } from '@/lib/prisma'
import { resolveMaterialIdForProduct } from '@/lib/material-product'
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
      include: { product: { select: { unit: true } }, material: { select: { id: true, stockUnit: true } } },
    })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    assertInventoryLocationDataScope(scope, [shipment.locationId])
    if (shipment.status !== 'PENDING') throw new SalesDomainError('只有待发货单可以新增货箱')

    const materialId = await resolveMaterialIdForProduct(tx, shipment.productId, shipment.materialId)
    if (!materialId) throw new SalesDomainError('发货物料未关联统一物料档案')
    const material = shipment.material?.id === materialId
      ? shipment.material
      : await tx.material.findUnique({ where: { id: materialId }, select: { id: true, stockUnit: true } })
    if (!material) throw new SalesDomainError('发货物料不存在', 404)

    const packed = await tx.packageDocumentItem.aggregate({
      where: { packageDocument: { is: { shipmentId, deletedAt: null } } },
      _sum: { quantity: true },
    })
    const remainingQty = Number((Number(shipment.qty) - Number(packed._sum.quantity || 0)).toFixed(6))
    if (input.quantity > remainingQty + quantityTolerance) {
      throw new SalesDomainError(`装箱数量超过未装数量 ${remainingQty} ${material.stockUnit || shipment.product.unit}`)
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
            materialId,
            quantity: input.quantity,
            unitSnapshot: material.stockUnit || shipment.product.unit,
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
      include: { shipment: { select: { status: true, locationId: true } } },
    })
    if (!packageDocument) throw new SalesDomainError('货箱单据不存在', 404)
    assertInventoryLocationDataScope(scope, [packageDocument.shipment.locationId])
    if (packageDocument.shipment.status !== 'PENDING') throw new SalesDomainError('已发货货箱不可归档')
    const updated = await tx.packageDocument.update({
      where: { id: packageId },
      data: { status: 'ARCHIVED', deletedAt: new Date(), deletedBy: actorName },
    })
    return { before: packageDocument, updated }
  }))
}
