import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export type SalesOrderQuery = {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
  page: number
  pageSize: number
}

export async function listSalesOrders(input: SalesOrderQuery) {
  const where: Prisma.SalesOrderWhereInput = { deletedAt: null }
  if (input.statuses.length === 1) where.status = input.statuses[0]
  else if (input.statuses.length > 1) where.status = { in: input.statuses }
  if (input.customerId) where.customerId = input.customerId
  const keywordFilters = tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.SalesOrderWhereInput => ({ OR: [
    { orderNo: { contains: token } },
    { voucherNo: { contains: token } },
    { note: { contains: token } },
    { customer: { is: { name: { contains: token } } } },
    { items: { some: { material: { is: { code: { contains: token } } } } } },
    { items: { some: { material: { is: { name: { contains: token } } } } } },
    { items: { some: { material: { is: { spec: { contains: token } } } } } },
  ] }))
  if (keywordFilters.length > 0) where.AND = keywordFilters
  const [orders, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true, phone: true, address: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            material: { select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true } },
            shipments: { where: { status: 'PENDING', deletedAt: null }, select: { qty: true } },
          },
        },
        _count: { select: { shipments: true } },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.salesOrder.count({ where }),
  ])
  const data = orders.map((order) => ({
    ...order,
    items: order.items.map(({ shipments, ...item }) => {
      const pendingQty = shipments.reduce((sum, shipment) => sum + Number(shipment.qty), 0)
      return {
        ...item,
        pendingQty,
        remainingQty: Math.max(0, Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))),
      }
    }),
  }))
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

export async function getSalesOrderOptions() {
  const [customers, materials] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, contact: true, phone: true, address: true },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: {
        id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true,
        defaultSalePrice: true, salesCurrency: true,
        stock: { select: { locationBalances: { select: { locationId: true, availableQty: true } } } },
      },
    }),
  ])
  return { customers, materials }
}

export async function listShippableSalesOrderItems(scope: EffectiveDataScope = unrestrictedDataScope) {
  const locationBalanceWhere = scope.inventoryMode === 'LOCATIONS'
    ? { locationId: { in: scope.locationIds } }
    : undefined
  const [items, customers, materials] = await Promise.all([
    prisma.salesOrderItem.findMany({
      where: {
        salesOrder: { is: { status: { in: ['CONFIRMED', 'PARTIAL'] }, deletedAt: null } },
        material: { is: { deletedAt: null } },
      },
      include: {
        salesOrder: { include: { customer: { select: { id: true, code: true, name: true, phone: true, address: true } } } },
        material: {
          select: {
            id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true,
            stock: {
              select: {
                locationBalances: { where: locationBalanceWhere, select: { locationId: true, availableQty: true } },
              },
            },
          },
        },
        shipments: { where: { status: 'PENDING', deletedAt: null }, select: { qty: true } },
      },
      orderBy: { salesOrder: { orderDate: 'desc' } },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, phone: true, address: true },
    }),
    prisma.material.findMany({
      where: { deletedAt: null }, orderBy: { code: 'asc' },
      select: {
        id: true, code: true, name: true, spec: true, stockUnit: true, unit: true,
        defaultSalePrice: true, salesCurrency: true,
        stock: {
          select: {
            locationBalances: { where: locationBalanceWhere, select: { locationId: true, availableQty: true } },
          },
        },
      },
    }),
  ])
  const data = items.flatMap(({ shipments, ...item }) => {
    const pendingQty = shipments.reduce((sum, shipment) => sum + Number(shipment.qty), 0)
    const remainingQty = Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))
    return remainingQty > 0 ? [{ ...item, pendingQty, remainingQty }] : []
  })
  return { data, customers, materials }
}
