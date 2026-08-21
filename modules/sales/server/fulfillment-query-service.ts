import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { SalesDomainError } from '../domain/sales-errors'
import { shipmentPackageInclude } from './shipment-package-query-service'
import {
  assertInventoryLocationDataScope,
  returnDataScopeWhere,
  shipmentDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { returnStatusOptions, shipmentStatusOptions } from '../model/fulfillment-view'

export type FulfillmentQuery = {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
  customer?: string | null
  advancedConditions?: ResourceSearchCondition[]
  page: number
  pageSize: number
}

function stringFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}

function numberFilter(condition: ResourceSearchCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return undefined
  if (condition.operator === 'gt') return { gt: value }
  if (condition.operator === 'gte') return { gte: value }
  if (condition.operator === 'lt') return { lt: value }
  if (condition.operator === 'lte') return { lte: value }
  return { equals: value }
}

function dateFilter(condition: ResourceSearchCondition) {
  const start = new Date(`${condition.value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return undefined
  if (condition.operator === 'gt') return { gt: new Date(start.getTime() + 86_400_000) }
  if (condition.operator === 'gte') return { gte: start }
  if (condition.operator === 'lt') return { lt: start }
  if (condition.operator === 'lte') return { lt: new Date(start.getTime() + 86_400_000) }
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) }
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
  for (const condition of input.advancedConditions || []) {
    const text = stringFilter(condition)
    if (['shipmentNo', 'voucherNo', 'customer', 'customerPhone', 'address', 'trackingNo', 'shippedBy', 'note'].includes(condition.field)) {
      andConditions.push({ [condition.field]: text } as Prisma.ShipmentWhereInput)
    } else if (condition.field === 'status') andConditions.push({ status: condition.value })
    else if (condition.field === 'customerId') andConditions.push({ customerId: condition.value === '__UNASSIGNED__' ? null : condition.value })
    else if (condition.field === 'product') andConditions.push({ product: { is: { OR: [{ sku: text }, { name: text }] } } })
    else if (condition.field === 'locationId') andConditions.push({ OR: [{ locationId: condition.value }, { location: { is: { code: text } } }, { location: { is: { name: text } } }] })
    else if (condition.field === 'qty' || condition.field === 'unitPrice' || condition.field === 'totalAmount') {
      const value = numberFilter(condition)
      if (value) andConditions.push({ [condition.field]: value } as Prisma.ShipmentWhereInput)
    } else if (condition.field === 'salesOrder') andConditions.push({ salesOrder: { is: { OR: [{ orderNo: text }, { voucherNo: text }] } } })
    else if (condition.field === 'lotNo') andConditions.push({ lotAllocations: { some: { status: 'ACTIVE', lot: { is: { OR: [{ lotNo: text }, { supplierLotNo: text }] } } } } })
    else if (condition.field === 'shippedAt' || condition.field === 'createdAt') {
      const value = dateFilter(condition)
      if (value) andConditions.push({ [condition.field]: value } as Prisma.ShipmentWhereInput)
    }
  }
  andConditions.push(...tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.ShipmentWhereInput => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { shipmentNo: { contains: token } }, { voucherNo: { contains: token } }, { customer: { contains: token } },
    { customerPhone: { contains: token } }, { address: { contains: token } }, { trackingNo: { contains: token } },
    { shippedBy: { contains: token } }, { note: { contains: token } },
    { salesOrder: { is: { orderNo: { contains: token } } } },
    { product: { is: { sku: { contains: token } } } }, { product: { is: { name: { contains: token } } } },
    { customerRef: { is: { code: { contains: token } } } }, { customerRef: { is: { name: { contains: token } } } },
    { location: { is: { code: { contains: token } } } }, { location: { is: { name: { contains: token } } } },
    { lotAllocations: { some: { status: 'ACTIVE', lot: { is: { OR: [{ lotNo: { contains: token } }, { supplierLotNo: { contains: token } }] } } } } },
    ...shipmentStatusOptions.filter((option) => option.label.toLocaleLowerCase('zh-CN').includes(token)).map((option) => ({ status: option.value })),
    ...(Number.isFinite(number) ? [{ qty: number }, { unitPrice: number }, { totalAmount: number }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ shippedAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }, { createdAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
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
        packages: {
          where: { deletedAt: null },
          include: shipmentPackageInclude,
          orderBy: [{ packedAt: 'asc' }, { createdAt: 'asc' }],
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
      packages: { where: { deletedAt: null }, include: shipmentPackageInclude, orderBy: [{ packedAt: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  if (!shipment) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, [shipment.locationId])
  const returnedQty = shipment.returnOrders.reduce((sum, item) => sum + Number(item.qty), 0)
  return {
    ...shipment,
    returnedQty,
    returnableQty: Math.max(0, Number((Number(shipment.qty) - returnedQty).toFixed(6))),
    returnOrders: undefined,
  }
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
      packages: {
        where: { deletedAt: null },
        include: shipmentPackageInclude,
        orderBy: [{ packedAt: 'asc' }, { createdAt: 'asc' }],
      },
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
  for (const condition of input.advancedConditions || []) {
    const text = stringFilter(condition)
    if (condition.field === 'returnNo' || condition.field === 'voucherNo' || condition.field === 'reason' || condition.field === 'note') andConditions.push({ [condition.field]: text } as Prisma.ReturnOrderWhereInput)
    else if (condition.field === 'status') andConditions.push({ status: condition.value })
    else if (condition.field === 'customerId') {
      const customerId = condition.value === '__UNASSIGNED__' ? null : condition.value
      andConditions.push({ OR: [{ shipment: { is: { customerId } } }, { shipmentId: null, product: { is: { customerId } } }] })
    } else if (condition.field === 'product') andConditions.push({ product: { is: { OR: [{ sku: text }, { name: text }] } } })
    else if (condition.field === 'shipmentNo') andConditions.push({ shipment: { is: { shipmentNo: text } } })
    else if (condition.field === 'locationId') andConditions.push({ OR: [{ locationId: condition.value }, { location: { is: { code: text } } }, { location: { is: { name: text } } }] })
    else if (condition.field === 'qty') {
      const value = numberFilter(condition)
      if (value) andConditions.push({ qty: value })
    } else if (condition.field === 'lotNo') andConditions.push({ lotAllocations: { some: { status: 'ACTIVE', shipmentAllocation: { is: { lot: { is: { OR: [{ lotNo: text }, { supplierLotNo: text }] } } } } } } })
    else if (condition.field === 'createdAt' || condition.field === 'processedAt') {
      const value = dateFilter(condition)
      if (value) andConditions.push({ [condition.field]: value } as Prisma.ReturnOrderWhereInput)
    }
  }
  andConditions.push(...tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.ReturnOrderWhereInput => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { returnNo: { contains: token } }, { voucherNo: { contains: token } }, { reason: { contains: token } }, { note: { contains: token } },
    { product: { is: { sku: { contains: token } } } }, { product: { is: { name: { contains: token } } } },
    { product: { is: { customer: { is: { code: { contains: token } } } } } },
    { product: { is: { customer: { is: { name: { contains: token } } } } } },
    { shipment: { is: { shipmentNo: { contains: token } } } },
    { shipment: { is: { voucherNo: { contains: token } } } },
    { shipment: { is: { customer: { contains: token } } } },
    { location: { is: { code: { contains: token } } } }, { location: { is: { name: { contains: token } } } },
    { lotAllocations: { some: { status: 'ACTIVE', shipmentAllocation: { is: { lot: { is: { OR: [{ lotNo: { contains: token } }, { supplierLotNo: { contains: token } }] } } } } } } },
    ...returnStatusOptions.filter((option) => option.label.toLocaleLowerCase('zh-CN').includes(token)).map((option) => ({ status: option.value })),
    ...(Number.isFinite(number) ? [{ qty: number }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ createdAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }, { processedAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
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
            inspections: { include: { checkItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } },
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
      inventoryLot: { include: { balances: true, inspections: { include: { checkItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } } } },
      lotAllocations: { include: { shipmentAllocation: { include: { lot: true, location: true } } } },
    },
  })
  if (!returnOrder) throw new SalesDomainError('退货单不存在', 404)
  assertInventoryLocationDataScope(scope, [returnOrder.locationId])
  return returnOrder
}
