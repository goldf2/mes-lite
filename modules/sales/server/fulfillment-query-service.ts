import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { SalesDomainError } from '../domain/sales-errors'
import {
  assertInventoryLocationDataScope,
  returnDataScopeWhere,
  shipmentDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'

export type FulfillmentQuery = {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
  customer?: string | null
  page: number
  pageSize: number
}

function applyStatuses<T extends { status?: string | { in: string[] } }>(where: T, statuses: string[]) {
  if (statuses.length === 1) where.status = statuses[0]
  else if (statuses.length > 1) where.status = { in: statuses }
}

export async function listShipments(input: FulfillmentQuery, scope: EffectiveDataScope = unrestrictedDataScope) {
  const where: Prisma.ShipmentWhereInput = { deletedAt: null }
  const andConditions: Prisma.ShipmentWhereInput[] = []
  andConditions.push(shipmentDataScopeWhere(scope))
  applyStatuses(where as { status?: string | { in: string[] } }, input.statuses)
  if (input.customerId === '__UNASSIGNED__') where.customerId = null
  else if (input.customerId) where.customerId = input.customerId
  if (input.customer) andConditions.push({ customer: { contains: input.customer } })
  andConditions.push(...tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.ShipmentWhereInput => ({ OR: [
    { shipmentNo: { contains: token } }, { voucherNo: { contains: token } }, { customer: { contains: token } },
    { customerPhone: { contains: token } }, { address: { contains: token } }, { trackingNo: { contains: token } },
    { shippedBy: { contains: token } }, { note: { contains: token } },
    { salesOrder: { is: { orderNo: { contains: token } } } },
    { product: { is: { sku: { contains: token } } } }, { product: { is: { name: { contains: token } } } },
    { customerRef: { is: { code: { contains: token } } } }, { customerRef: { is: { name: { contains: token } } } },
  ] })))
  if (andConditions.length > 0) where.AND = andConditions
  const [shipments, total, customers] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
        customerRef: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        salesOrder: { select: { id: true, orderNo: true, voucherNo: true } },
        returnOrders: {
          where: { deletedAt: null, status: { in: ['PENDING', 'PROCESSED'] } },
          select: { qty: true },
        },
        lotAllocations: {
          where: { status: 'ACTIVE' },
          include: {
            lot: { select: { id: true, lotNo: true, sourceType: true, supplierLotNo: true, status: true } },
            location: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.shipment.count({ where }),
    prisma.customer.findMany({
      where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, contact: true, phone: true, address: true },
    }),
  ])
  const data = shipments.map((shipment) => {
    const returnedQty = shipment.returnOrders.reduce((sum, item) => sum + Number(item.qty), 0)
    return {
      ...shipment,
      returnedQty,
      returnableQty: Math.max(0, Number((Number(shipment.qty) - returnedQty).toFixed(6))),
      returnOrders: undefined,
    }
  })
  return { data, customers, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

export async function listReturnShipmentOptions(scope: EffectiveDataScope = unrestrictedDataScope) {
  const shipments = await prisma.shipment.findMany({
    where: { deletedAt: null, status: { in: ['SHIPPED', 'DELIVERED'] }, ...shipmentDataScopeWhere(scope) },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
      customerRef: { select: { id: true, code: true, name: true } },
      returnOrders: {
        where: { deletedAt: null, status: { in: ['PENDING', 'PROCESSED'] } },
        select: { qty: true },
      },
    },
    orderBy: [{ shippedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })
  return shipments.flatMap((shipment) => {
    const returnedQty = shipment.returnOrders.reduce((sum, item) => sum + Number(item.qty), 0)
    const returnableQty = Math.max(0, Number((Number(shipment.qty) - returnedQty).toFixed(6)))
    if (returnableQty <= 0.000001) return []
    return [{
      id: shipment.id,
      shipmentNo: shipment.shipmentNo,
      productId: shipment.productId,
      product: shipment.product,
      customer: shipment.customer,
      customerRef: shipment.customerRef,
      status: shipment.status,
      shippedAt: shipment.shippedAt?.toISOString() || null,
      qty: Number(shipment.qty),
      returnedQty,
      returnableQty,
    }]
  })
}

export async function getShipmentDetail(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { product: true, location: true, returnOrders: { orderBy: { createdAt: 'desc' } } },
  })
  if (!shipment) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, [shipment.locationId])
  return shipment
}

export async function getShipmentDeliveryNoteSource(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      product: { select: { sku: true, name: true, unit: true } },
      material: { select: { code: true, name: true, spec: true, stockUnit: true } },
      location: { select: { code: true, name: true } },
      customerRef: { select: { phone: true, address: true } },
      salesOrder: { select: { orderNo: true, voucherNo: true } },
    },
  })
  if (!shipment) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, [shipment.locationId])
  return shipment
}

export async function listReturns(input: FulfillmentQuery, scope: EffectiveDataScope = unrestrictedDataScope) {
  const where: Prisma.ReturnOrderWhereInput = { deletedAt: null }
  const andConditions: Prisma.ReturnOrderWhereInput[] = []
  andConditions.push(returnDataScopeWhere(scope))
  applyStatuses(where as { status?: string | { in: string[] } }, input.statuses)
  if (input.customerId === '__UNASSIGNED__') {
    andConditions.push({ OR: [
      { shipment: { is: { customerId: null } } },
      { shipmentId: null, product: { is: { customerId: null } } },
    ] })
  } else if (input.customerId) {
    andConditions.push({ OR: [
      { shipment: { is: { customerId: input.customerId } } },
      { shipmentId: null, product: { is: { customerId: input.customerId } } },
    ] })
  }
  andConditions.push(...tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.ReturnOrderWhereInput => ({ OR: [
    { returnNo: { contains: token } }, { voucherNo: { contains: token } }, { reason: { contains: token } }, { note: { contains: token } },
    { product: { is: { sku: { contains: token } } } }, { product: { is: { name: { contains: token } } } },
    { product: { is: { customer: { is: { code: { contains: token } } } } } },
    { product: { is: { customer: { is: { name: { contains: token } } } } } },
    { shipment: { is: { shipmentNo: { contains: token } } } },
    { shipment: { is: { voucherNo: { contains: token } } } },
    { shipment: { is: { customer: { contains: token } } } },
  ] })))
  if (andConditions.length > 0) where.AND = andConditions
  const [data, total] = await Promise.all([
    prisma.returnOrder.findMany({
      where,
      include: {
        product: { include: { customer: { select: { id: true, code: true, name: true } } } },
        shipment: { include: { customerRef: { select: { id: true, code: true, name: true } } } },
        location: true,
        inventoryLot: {
          include: {
            balances: { orderBy: { createdAt: 'asc' } },
            inspections: { orderBy: { createdAt: 'desc' } },
          },
        },
        lotAllocations: {
          where: { status: 'ACTIVE' },
          include: {
            shipmentAllocation: {
              include: {
                lot: { select: { id: true, lotNo: true, sourceType: true, supplierLotNo: true, status: true } },
                location: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.returnOrder.count({ where }),
  ])
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

export async function getReturnDetail(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const returnOrder = await prisma.returnOrder.findUnique({
    where: { id },
    include: {
      product: true,
      shipment: true,
      location: true,
      inventoryLot: { include: { balances: true, inspections: { orderBy: { createdAt: 'desc' } } } },
      lotAllocations: { include: { shipmentAllocation: { include: { lot: true, location: true } } } },
    },
  })
  if (!returnOrder) throw new SalesDomainError('退货单不存在', 404)
  assertInventoryLocationDataScope(scope, [returnOrder.locationId])
  return returnOrder
}
