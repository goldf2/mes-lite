import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveInventoryLocation } from '@/modules/inventory'
import { materialProductPrefix, resolveProductId } from '@/lib/material-product'
import type { CreateReturnCommand, CreateShipmentCommand } from '../contracts/fulfillment-schema'
import { datedDocumentPrefix, nextDatedDocumentNo } from '../domain/sales-document-numbering'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { loadShipmentWarehousePackages, releaseShipmentWarehousePackages, reserveShipmentWarehousePackage } from './shipment-package-allocation-service'

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
  looseQty: number
  boxItems: Array<{ packageId: string; packageItemId: string; inventoryLotId: string; quantity: number }>
}

export async function prepareShipmentItems(
  tx: Prisma.TransactionClient,
  data: CreateShipmentCommand,
  scope: EffectiveDataScope,
  options: { ownShipmentId?: string; currentPrices?: ReadonlyMap<string, number> } = {},
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
    const unitPrice = input.unitPrice ?? options.currentPrices?.get(inventoryKey) ?? Number(material.defaultSalePrice || 0)
    prepared.push({
      materialId: material.id,
      productId,
      locationId: location.id,
      qty: input.qty,
      unitSnapshot: material.stockUnit,
      unitPrice,
      totalAmount: input.qty * unitPrice,
      looseQty: input.qty,
      boxItems: [],
    })
  }
  const packages = await loadShipmentWarehousePackages(tx, data.packageIds || [], customer.id, scope, options.ownShipmentId)
  for (const box of packages) {
    const locationId = box.placement!.locationId
    for (const content of box.items) {
      let item = prepared.find((row) => row.materialId === content.materialId && row.locationId === locationId)
      if (!item) {
        item = { materialId: content.materialId, productId: await resolveProductId(tx, `${materialProductPrefix}${content.materialId}`, { description: '由发货物料自动映射。' }), locationId, qty: 0, unitSnapshot: content.unitSnapshot, unitPrice: options.currentPrices?.get(`${content.materialId}:${locationId}`) ?? Number(content.material.defaultSalePrice || 0), totalAmount: 0, looseQty: 0, boxItems: [] }
        prepared.push(item)
      }
      item.qty = Number((item.qty + Number(content.quantity)).toFixed(6))
      item.totalAmount = item.qty * item.unitPrice
      item.boxItems.push({ packageId: box.id, packageItemId: content.id, inventoryLotId: content.inventoryLotId!, quantity: Number(content.quantity) })
    }
  }
  if (prepared.length === 0) throw new SalesDomainError('至少添加一项散货或选择一箱货物')
  if (prepared.length > 100) throw new SalesDomainError('合并后发货明细不能超过 100 项')
  if (prepared.some((item) => !Number.isFinite(item.qty) || !Number.isFinite(item.totalAmount)) || !Number.isFinite(prepared.reduce((sum, item) => sum + item.qty, 0)) || !Number.isFinite(prepared.reduce((sum, item) => sum + item.totalAmount, 0))) throw new SalesDomainError('发货数量或金额超出有效范围')
  return { customer, prepared, packages }
}

export async function createManagedShipment(data: CreateShipmentCommand, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope, actorName = '系统') {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const [{ customer, prepared, packages }, latest] = await Promise.all([
      prepareShipmentItems(tx, data, scope),
      tx.shipment.findFirst({
        where: { shipmentNo: { startsWith: datedDocumentPrefix('SH', now) } },
        orderBy: { shipmentNo: 'desc' }, select: { shipmentNo: true },
      }),
    ])
    const first = prepared[0]
    const shipment = await tx.shipment.create({
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
    const allocations = new Map<string, string>()
    for (const box of packages) {
      const allocation = await reserveShipmentWarehousePackage(tx, box, shipment.id, actorName)
      allocations.set(box.id, allocation.id)
    }
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index]
      const shipmentItemId = shipment.items[index].id
      if (item.looseQty > 0) await tx.shipmentItemSource.create({ data: { shipmentItemId, sourceType: 'LOOSE', locationId: item.locationId, quantity: item.looseQty } })
      for (const box of item.boxItems) await tx.shipmentItemSource.create({ data: { shipmentItemId, sourceType: 'BOX', allocationId: allocations.get(box.packageId)!, packageDocumentItemId: box.packageItemId, inventoryLotId: box.inventoryLotId, locationId: item.locationId, quantity: box.quantity } })
    }
    return shipment
  }))
}

export async function archiveManagedShipment(id: string, scope: EffectiveDataScope = unrestrictedDataScope, actorName = '归档操作') {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const before = await tx.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
    if (!before || before.deletedAt) throw new SalesDomainError('发货单不存在或已归档', 404)
    assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
    const hasWarehouseBoxes = before.status === 'PENDING' && await tx.shipmentPackageAllocation.count({ where: { shipmentId: id, status: 'RESERVED' } }) > 0
    const now = new Date()
    const changed = await tx.shipment.updateMany({
      where: { id, status: before.status, updatedAt: before.updatedAt, deletedAt: null },
      data: {
        deletedAt: now,
        ...(hasWarehouseBoxes ? { status: 'CANCELLED', cancelledAt: now, cancelledBy: actorName, cancelReason: '归档待发货单，释放货箱占用；恢复仅恢复历史记录' } : {}),
      },
    })
    if (changed.count !== 1) throw new SalesDomainError('发货单已变化，请刷新后重试', 409)
    const updated = await tx.shipment.findUniqueOrThrow({ where: { id } })
    if (before.status === 'PENDING') await releaseShipmentWarehousePackages(tx, id)
    return { before, updated }
  }))
}

export async function createManagedReturn(input: CreateReturnCommand, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  assertInventoryLocationDataScope(scope, [input.locationId])
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const item = await tx.shipmentItem.findUnique({
      where: { id: input.shipmentItemId },
      include: { shipment: true, material: true, stockShortage: true },
    })
    if (!item || item.shipmentId !== input.shipmentId || item.shipment.deletedAt) throw new SalesDomainError('原发货明细不存在', 404)
    if (!['SHIPPED', 'DELIVERED'].includes(item.shipment.status)) throw new SalesDomainError('只有已发货或已签收单据可以退货')
    if (item.stockShortage?.status === 'OPEN') throw new SalesDomainError('该发货明细仍有待补库存，补齐批次后才能登记退货')
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
