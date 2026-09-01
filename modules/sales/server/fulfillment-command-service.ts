import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertInventoryIssueAvailability, resolveInventoryLocation } from '@/modules/inventory'
import { materialProductPrefix, resolveProductId } from '@/lib/material-product'
import type { CreateReturnCommand, CreateShipmentCommand } from '../contracts/fulfillment-schema'
import { datedDocumentPrefix, nextDatedDocumentNo } from '../domain/sales-document-numbering'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

const shipmentInclude = {
  product: { select: { id: true, name: true, sku: true, unit: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
  customerRef: { select: { id: true, code: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
  items: {
    include: {
      material: true,
      location: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const

type PreparedShipmentItem = {
  materialId: string
  productId: string
  locationId: string
  qty: number
  unitSnapshot: string
  unitPrice: number
  totalAmount: number
}

async function prepareShipmentItems(
  tx: Prisma.TransactionClient,
  data: CreateShipmentCommand,
  scope: EffectiveDataScope,
) {
  const customer = await tx.customer.findFirst({ where: { id: data.customerId, deletedAt: null } })
  if (!customer) throw new SalesDomainError('客户不存在或已归档')
  const prepared: PreparedShipmentItem[] = []
  const inventoryKeys = new Set<string>()

  for (const input of data.items) {
    const location = await resolveInventoryLocation(tx, input.locationId)
    assertInventoryLocationDataScope(scope, [location.id])
    const material = await tx.material.findFirst({ where: { id: input.materialId, deletedAt: null } })
    if (!material) throw new SalesDomainError('发货物料不存在或已归档')
    if (material.customerId && material.customerId !== customer.id) throw new SalesDomainError(`物料 ${material.code} 不属于所选客户`)
    const inventoryKey = `${material.id}:${location.id}`
    if (inventoryKeys.has(inventoryKey)) throw new SalesDomainError('同一物料和库位不能重复添加，请合并为一条明细')
    inventoryKeys.add(inventoryKey)
    const productId = await resolveProductId(tx, `${materialProductPrefix}${material.id}`, { description: '由发货物料自动映射。' })
    const unitPrice = input.unitPrice ?? Number(material.defaultSalePrice || 0)
    prepared.push({
      materialId: material.id,
      productId,
      locationId: location.id,
      qty: input.qty,
      unitSnapshot: material.stockUnit,
      unitPrice,
      totalAmount: input.qty * unitPrice,
    })
  }

  for (const item of prepared) {
    await assertInventoryIssueAvailability(tx, {
      materialId: item.materialId,
      stockQty: item.qty,
      locationId: item.locationId,
    })
  }
  return { customer, prepared }
}

export async function createManagedShipment(data: CreateShipmentCommand, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const [{ customer, prepared }, latest] = await Promise.all([
      prepareShipmentItems(tx, data, scope),
      tx.shipment.findFirst({
        where: { shipmentNo: { startsWith: datedDocumentPrefix('SH', now) } },
        orderBy: { shipmentNo: 'desc' }, select: { shipmentNo: true },
      }),
    ])
    const first = prepared[0]
    return tx.shipment.create({
      data: {
        shipmentNo: nextDatedDocumentNo('SH', now, latest?.shipmentNo),
        voucherNo: data.voucherNo?.trim() || null,
        productId: first.productId,
        materialId: first.materialId,
        locationId: first.locationId,
        customerId: customer.id,
        qty: prepared.reduce((sum, item) => sum + item.qty, 0),
        unitPrice: prepared.length === 1 ? first.unitPrice : 0,
        totalAmount: prepared.reduce((sum, item) => sum + item.totalAmount, 0),
        customer: customer.name,
        customerPhone: customer.phone,
        address: customer.address,
        trackingNo: data.trackingNo?.trim() || null,
        note: data.note?.trim() || null,
        shippedBy: data.shippedBy?.trim() || null,
        status: 'PENDING',
        items: {
          create: prepared.map((item, sortOrder) => ({
            sortOrder,
            materialId: item.materialId,
            locationId: item.locationId,
            qty: item.qty,
            unitSnapshot: item.unitSnapshot,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: shipmentInclude,
    })
  }))
}

export async function archiveManagedShipment(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
  if (!before || before.deletedAt) throw new SalesDomainError('发货单不存在或已归档', 404)
  assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
  const updated = await prisma.shipment.update({ where: { id }, data: { deletedAt: new Date() } })
  return { before, updated }
}

export async function createManagedReturn(input: CreateReturnCommand, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  assertInventoryLocationDataScope(scope, [input.locationId])
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const item = await tx.shipmentItem.findUnique({
      where: { id: input.shipmentItemId },
      include: { shipment: true, material: true },
    })
    if (!item || item.shipmentId !== input.shipmentId || item.shipment.deletedAt) throw new SalesDomainError('原发货明细不存在', 404)
    if (!['SHIPPED', 'DELIVERED'].includes(item.shipment.status)) throw new SalesDomainError('只有已发货或已签收单据可以退货')
    const returned = await tx.returnOrder.aggregate({
      where: { shipmentItemId: item.id, deletedAt: null, status: { in: ['PENDING', 'PROCESSED'] } },
      _sum: { qty: true },
    })
    const remainingQty = Number((Number(item.qty) - Number(returned._sum.qty || 0)).toFixed(6))
    if (input.qty > remainingQty + 0.000001) throw new SalesDomainError(`退货数量超过该发货明细可退数量 ${remainingQty} ${item.unitSnapshot}`)
    const [location, latest] = await Promise.all([
      resolveInventoryLocation(tx, input.locationId),
      tx.returnOrder.findFirst({
        where: { returnNo: { startsWith: datedDocumentPrefix('RT', now) } },
        orderBy: { returnNo: 'desc' }, select: { returnNo: true },
      }),
    ])
    const productId = await resolveProductId(tx, `${materialProductPrefix}${item.materialId}`, { description: '由退货物料自动映射。' })
    return tx.returnOrder.create({
      data: {
        returnNo: nextDatedDocumentNo('RT', now, latest?.returnNo),
        voucherNo: input.voucherNo?.trim() || null,
        shipmentId: item.shipmentId,
        shipmentItemId: item.id,
        productId,
        materialId: item.materialId,
        locationId: location.id,
        qty: input.qty,
        reason: input.reason,
        note: input.note?.trim() || null,
        status: 'PENDING',
      },
      include: { product: true, shipment: true, shipmentItem: { include: { material: true, location: true } }, location: true },
    })
  }))
}

export async function archiveManagedReturn(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.returnOrder.findUnique({ where: { id } })
  if (!before || before.deletedAt) throw new SalesDomainError('退货单不存在或已归档', 404)
  assertInventoryLocationDataScope(scope, [before.locationId])
  const updated = await prisma.returnOrder.update({ where: { id }, data: { deletedAt: new Date() } })
  return { before, updated }
}
