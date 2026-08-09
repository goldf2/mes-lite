import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { SalesDomainError } from '../domain/sales-errors'

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

export async function listShipments(input: FulfillmentQuery) {
  const where: Prisma.ShipmentWhereInput = { deletedAt: null }
  const andConditions: Prisma.ShipmentWhereInput[] = []
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
  const [data, total, customers] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
        customerRef: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        salesOrder: { select: { id: true, orderNo: true, voucherNo: true } },
      },
      orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.shipment.count({ where }),
    prisma.customer.findMany({
      where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, contact: true, phone: true, address: true },
    }),
  ])
  return { data, customers, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

export async function getShipmentDetail(id: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { product: true, location: true, returnOrders: { orderBy: { createdAt: 'desc' } } },
  })
  if (!shipment) throw new SalesDomainError('发货单不存在', 404)
  return shipment
}

export async function getShipmentDeliveryNoteSource(id: string) {
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
  return shipment
}

export async function listReturns(input: FulfillmentQuery) {
  const where: Prisma.ReturnOrderWhereInput = { deletedAt: null }
  const andConditions: Prisma.ReturnOrderWhereInput[] = []
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
      },
      orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.returnOrder.count({ where }),
  ])
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

export async function getReturnDetail(id: string) {
  const returnOrder = await prisma.returnOrder.findUnique({ where: { id }, include: { product: true, shipment: true } })
  if (!returnOrder) throw new SalesDomainError('退货单不存在', 404)
  return returnOrder
}
