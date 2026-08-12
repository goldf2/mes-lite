import { prisma } from '@/lib/prisma'
import { assertInventoryIssueAvailability, resolveInventoryLocation } from '@/lib/inventory'
import { materialProductPrefix, resolveMaterialIdForProduct, resolveProductId } from '@/lib/material-product'
import type { CreateReturnCommand, CreateShipmentCommand } from '../contracts/fulfillment-schema'
import { datedDocumentPrefix, nextDatedDocumentNo } from '../domain/sales-document-numbering'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { getSalesOrderItemRemainingQty } from './sales-order-availability-service'

const shipmentInclude = {
  product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
  customerRef: { select: { id: true, code: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, orderNo: true, voucherNo: true } },
} as const

export async function createManagedShipment(data: CreateShipmentCommand, now = new Date()) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const [location, latest] = await Promise.all([
      resolveInventoryLocation(tx, data.locationId),
      tx.shipment.findFirst({
        where: { shipmentNo: { startsWith: datedDocumentPrefix('SH', now) } },
        orderBy: { shipmentNo: 'desc' }, select: { shipmentNo: true },
      }),
    ])
    const shipmentNo = nextDatedDocumentNo('SH', now, latest?.shipmentNo)
    if (data.salesOrderItemId) {
      const { item, remainingQty } = await getSalesOrderItemRemainingQty(tx, data.salesOrderItemId)
      if (!['CONFIRMED', 'PARTIAL'].includes(item.salesOrder.status)) throw new SalesDomainError('销售订单尚未确认或已经结束')
      if (item.salesOrder.customer.deletedAt) throw new SalesDomainError('销售订单客户已归档')
      if (item.material.deletedAt) throw new SalesDomainError('销售订单物料已归档')
      if (data.qty > remainingQty + 0.000001) throw new SalesDomainError(`发货数量超过订单未发数量 ${remainingQty} ${item.unit}`)
      await assertInventoryIssueAvailability(tx, { materialId: item.materialId, stockQty: data.qty, locationId: location.id })
      const productId = await resolveProductId(tx, `${materialProductPrefix}${item.materialId}`, { description: '由销售订单物料自动映射，用于发货兼容。' })
      return tx.shipment.create({
        data: {
          shipmentNo, voucherNo: item.salesOrder.voucherNo, productId, materialId: item.materialId,
          locationId: location.id, customerId: item.salesOrder.customerId, salesOrderId: item.salesOrderId,
          salesOrderItemId: item.id, qty: data.qty, unitPrice: item.unitPrice,
          totalAmount: data.qty * Number(item.unitPrice), customer: item.salesOrder.customer.name,
          customerPhone: item.salesOrder.customer.phone, address: item.salesOrder.customer.address,
          trackingNo: data.trackingNo?.trim() || null, note: data.note?.trim() || null,
          shippedBy: data.shippedBy?.trim() || null, status: 'PENDING',
        },
        include: shipmentInclude,
      })
    }
    const [material, customer] = await Promise.all([
      tx.material.findFirst({ where: { id: data.materialId!, deletedAt: null } }),
      tx.customer.findFirst({ where: { id: data.customerId!, deletedAt: null } }),
    ])
    if (!material) throw new SalesDomainError('发货物料不存在或已归档')
    if (!customer) throw new SalesDomainError('客户不存在或已归档')
    await assertInventoryIssueAvailability(tx, { materialId: material.id, stockQty: data.qty, locationId: location.id })
    const productId = await resolveProductId(tx, `${materialProductPrefix}${material.id}`, { description: '由独立发货单物料自动映射。' })
    const unitPrice = data.unitPrice ?? Number(material.defaultSalePrice || 0)
    return tx.shipment.create({
      data: {
        shipmentNo, voucherNo: data.voucherNo?.trim() || null, productId, materialId: material.id,
        locationId: location.id, customerId: customer.id, salesOrderId: null, salesOrderItemId: null,
        qty: data.qty, unitPrice, totalAmount: data.qty * unitPrice, customer: customer.name,
        customerPhone: customer.phone, address: customer.address,
        trackingNo: data.trackingNo?.trim() || null, note: data.note?.trim() || null,
        shippedBy: data.shippedBy?.trim() || null, status: 'PENDING',
      },
      include: shipmentInclude,
    })
  }))
}

export async function archiveManagedShipment(id: string) {
  const before = await prisma.shipment.findUnique({ where: { id } })
  if (!before || before.deletedAt) throw new SalesDomainError('发货单不存在或已归档', 404)
  const updated = await prisma.shipment.update({ where: { id }, data: { deletedAt: new Date() } })
  return { before, updated }
}

export async function createManagedReturn(input: CreateReturnCommand, now = new Date()) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const materialId = await resolveMaterialIdForProduct(tx, input.productId)
    if (!materialId) throw new SalesDomainError('退货物料未关联统一物料档案')
    const productId = await resolveProductId(tx, input.productId, { description: '由物料自动映射，用于退货兼容。' })
    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw new SalesDomainError('物料不存在', 404)
    const shipment = await tx.shipment.findUnique({ where: { id: input.shipmentId } })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) throw new SalesDomainError('只有已发货或已签收单据可以退货')
    const shipmentMaterialId = await resolveMaterialIdForProduct(tx, shipment.productId, shipment.materialId)
    if (!shipmentMaterialId || shipmentMaterialId !== materialId) throw new SalesDomainError('退货物料必须与原发货单一致')
    const returned = await tx.returnOrder.aggregate({
      where: { shipmentId: input.shipmentId, deletedAt: null, status: { in: ['PENDING', 'PROCESSED'] } },
      _sum: { qty: true },
    })
    const remainingQty = Number((Number(shipment.qty) - Number(returned._sum.qty || 0)).toFixed(6))
    if (input.qty > remainingQty + 0.000001) throw new SalesDomainError(`退货数量超过原发货可退数量 ${remainingQty}`)
    const [location, latest] = await Promise.all([
      resolveInventoryLocation(tx, input.locationId),
      tx.returnOrder.findFirst({
        where: { returnNo: { startsWith: datedDocumentPrefix('RT', now) } },
        orderBy: { returnNo: 'desc' }, select: { returnNo: true },
      }),
    ])
    return tx.returnOrder.create({
      data: {
        returnNo: nextDatedDocumentNo('RT', now, latest?.returnNo), voucherNo: input.voucherNo?.trim() || null,
        shipmentId: input.shipmentId, productId, materialId, locationId: location.id,
        qty: input.qty, reason: input.reason, note: input.note?.trim() || null, status: 'PENDING',
      },
      include: { product: true, shipment: true, location: true },
    })
  }))
}

export async function archiveManagedReturn(id: string) {
  const before = await prisma.returnOrder.findUnique({ where: { id } })
  if (!before || before.deletedAt) throw new SalesDomainError('退货单不存在或已归档', 404)
  const updated = await prisma.returnOrder.update({ where: { id }, data: { deletedAt: new Date() } })
  return { before, updated }
}
