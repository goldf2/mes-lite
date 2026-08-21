import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { salesOrderStatusOptions } from '../model/sales-order-view'

export type SalesOrderQuery = {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
  advancedConditions?: ResourceSearchCondition[]
  page: number
  pageSize: number
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

function stringFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}

async function salesOrderIdsByRelationCount(condition: ResourceSearchCondition) {
  const expected = Number(condition.value)
  if (!Number.isFinite(expected)) return []
  const rows = condition.field === 'itemCount'
    ? await prisma.salesOrderItem.groupBy({ by: ['salesOrderId'], _count: { id: true } })
    : await prisma.shipment.groupBy({ by: ['salesOrderId'], where: { salesOrderId: { not: null }, deletedAt: null }, _count: { id: true } })
  const matches = (actual: number) => {
    if (condition.operator === 'gt') return actual > expected
    if (condition.operator === 'gte') return actual >= expected
    if (condition.operator === 'lt') return actual < expected
    if (condition.operator === 'lte') return actual <= expected
    return actual === expected
  }
  return rows.flatMap((row) => row.salesOrderId && matches(row._count.id) ? [row.salesOrderId] : [])
}

export async function listSalesOrders(input: SalesOrderQuery) {
  const where: Prisma.SalesOrderWhereInput = { deletedAt: null }
  if (input.statuses.length === 1) where.status = input.statuses[0]
  else if (input.statuses.length > 1) where.status = { in: input.statuses }
  if (input.customerId) where.customerId = input.customerId
  const advancedFilters: Prisma.SalesOrderWhereInput[] = []
  for (const condition of input.advancedConditions || []) {
    const text = stringFilter(condition)
    if (condition.field === 'orderNo' || condition.field === 'voucherNo' || condition.field === 'note') advancedFilters.push({ [condition.field]: text })
    else if (condition.field === 'status') advancedFilters.push({ status: condition.value })
    else if (condition.field === 'customerId') advancedFilters.push({ customerId: condition.value })
    else if (condition.field === 'material') advancedFilters.push({ items: { some: { material: { is: { OR: [{ code: text }, { name: text }, { spec: text }] } } } } })
    else if (condition.field === 'orderDate' || condition.field === 'deliveryDate') {
      const value = dateFilter(condition)
      if (value) advancedFilters.push({ [condition.field]: value })
    } else if (condition.field === 'totalAmount') {
      const value = numberFilter(condition)
      if (value) advancedFilters.push({ totalAmount: value })
    } else if (condition.field === 'currency') advancedFilters.push({ currency: condition.value })
    else if (condition.field === 'itemCount' || condition.field === 'shipmentCount') advancedFilters.push({ id: { in: await salesOrderIdsByRelationCount(condition) } })
  }
  const keywordFilters = await Promise.all(tokenizeKeywordQuery(input.keyword || '').map(async (token): Promise<Prisma.SalesOrderWhereInput> => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    const countIds = Number.isFinite(number)
      ? Array.from(new Set([...(await salesOrderIdsByRelationCount({ id: 'keyword-items', field: 'itemCount', operator: 'equals', value: token })), ...(await salesOrderIdsByRelationCount({ id: 'keyword-shipments', field: 'shipmentCount', operator: 'equals', value: token }))]))
      : []
    return { OR: [
    { orderNo: { contains: token } },
    { voucherNo: { contains: token } },
    { note: { contains: token } },
    { customer: { is: { name: { contains: token } } } },
    { customer: { is: { code: { contains: token } } } },
    { items: { some: { material: { is: { code: { contains: token } } } } } },
    { items: { some: { material: { is: { name: { contains: token } } } } } },
    { items: { some: { material: { is: { spec: { contains: token } } } } } },
    ...salesOrderStatusOptions.filter((option) => option.label.toLocaleLowerCase('zh-CN').includes(token)).map((option) => ({ status: option.value })),
    ...('人民币'.includes(token) ? [{ currency: 'CNY' }] : []),
    ...(Number.isFinite(number) ? [{ totalAmount: number }] : []),
    ...(countIds.length > 0 ? [{ id: { in: countIds } }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ orderDate: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }, { deliveryDate: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
  if (keywordFilters.length > 0 || advancedFilters.length > 0) where.AND = [...advancedFilters, ...keywordFilters]
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
