import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { shipmentDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { loadPrimaryMaterialImageMap } from '@/modules/materials'
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
  const matches = (actual: number) => {
    if (condition.operator === 'gt') return actual > expected
    if (condition.operator === 'gte') return actual >= expected
    if (condition.operator === 'lt') return actual < expected
    if (condition.operator === 'lte') return actual <= expected
    return actual === expected
  }
  const rows = await prisma.salesOrderItem.groupBy({ by: ['salesOrderId'], _count: { id: true } })
  return rows.flatMap((row) => matches(row._count.id) ? [row.salesOrderId] : [])
}

type DeliveryReference = {
  customerId: string
  materialId: string
  orderedQty: number
  pendingQty: number
  shippedQty: number
  remainingQty: number
  overQty: number
  unit: string
}

const deliveryReferenceKey = (customerId: string, materialId: string) => `${customerId}:${materialId}`

async function loadCustomerMaterialDeliveryReferences(pairs?: Array<{ customerId: string; materialId: string }>, scope: EffectiveDataScope = unrestrictedDataScope) {
  const uniquePairs = Array.from(new Map((pairs || []).map((pair) => [deliveryReferenceKey(pair.customerId, pair.materialId), pair])).values())
  if (pairs && uniquePairs.length === 0) return new Map<string, DeliveryReference>()
  const orderPairWhere = uniquePairs.length > 0
    ? { OR: uniquePairs.map((pair) => ({ materialId: pair.materialId, salesOrder: { is: { customerId: pair.customerId } } })) }
    : {}
  const shipmentPairWhere = uniquePairs.length > 0
    ? { OR: uniquePairs.map((pair) => ({ materialId: pair.materialId, shipment: { is: { customerId: pair.customerId } } })) }
    : {}
  const [orderItems, shipmentItems] = await Promise.all([
    prisma.salesOrderItem.findMany({
      where: {
        ...orderPairWhere,
        salesOrder: { is: { deletedAt: null, status: { in: ['CONFIRMED', 'PARTIAL', 'COMPLETED'] } } },
      },
      select: { materialId: true, qty: true, unit: true, salesOrder: { select: { customerId: true } } },
    }),
    prisma.shipmentItem.findMany({
      where: {
        ...shipmentPairWhere,
        shipment: { is: { deletedAt: null, customerId: { not: null }, status: { in: ['PENDING', 'SHIPPED', 'DELIVERED'] }, ...shipmentDataScopeWhere(scope) } },
      },
      select: { materialId: true, qty: true, unitSnapshot: true, shipment: { select: { customerId: true, status: true } } },
    }),
  ])
  const references = new Map<string, DeliveryReference>()
  const ensure = (customerId: string, materialId: string, unit: string) => {
    const key = deliveryReferenceKey(customerId, materialId)
    const current = references.get(key) || { customerId, materialId, orderedQty: 0, pendingQty: 0, shippedQty: 0, remainingQty: 0, overQty: 0, unit }
    references.set(key, current)
    return current
  }
  for (const item of orderItems) ensure(item.salesOrder.customerId, item.materialId, item.unit).orderedQty += Number(item.qty)
  for (const item of shipmentItems) {
    if (!item.shipment.customerId) continue
    const reference = ensure(item.shipment.customerId, item.materialId, item.unitSnapshot)
    if (item.shipment.status === 'PENDING') reference.pendingQty += Number(item.qty)
    else reference.shippedQty += Number(item.qty)
  }
  for (const reference of Array.from(references.values())) {
    const balance = Number((reference.orderedQty - reference.pendingQty - reference.shippedQty).toFixed(6))
    reference.remainingQty = Math.max(0, balance)
    reference.overQty = Math.max(0, -balance)
  }
  return references
}

export async function listCustomerMaterialDeliveryReferences(scope: EffectiveDataScope = unrestrictedDataScope) {
  const references = Array.from((await loadCustomerMaterialDeliveryReferences(undefined, scope)).values())
  if (references.length === 0) return []
  const [customers, materials] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: references.map((item) => item.customerId) } }, select: { id: true, code: true, name: true } }),
    prisma.material.findMany({ where: { id: { in: references.map((item) => item.materialId) } }, select: { id: true, code: true, name: true } }),
  ])
  const customerMap = new Map(customers.map((item) => [item.id, item]))
  const materialMap = new Map(materials.map((item) => [item.id, item]))
  return references.map((reference) => ({
    ...reference,
    customer: customerMap.get(reference.customerId) || null,
    material: materialMap.get(reference.materialId) || null,
  })).sort((left, right) => right.remainingQty - left.remainingQty || right.overQty - left.overQty)
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
    else if (condition.field === 'itemCount') advancedFilters.push({ id: { in: await salesOrderIdsByRelationCount(condition) } })
  }
  const keywordFilters = await Promise.all(tokenizeKeywordQuery(input.keyword || '').map(async (token): Promise<Prisma.SalesOrderWhereInput> => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    const countIds = Number.isFinite(number)
      ? await salesOrderIdsByRelationCount({ id: 'keyword-items', field: 'itemCount', operator: 'equals', value: token })
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
          },
        },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.salesOrder.count({ where }),
  ])
  const materialIds = orders.flatMap((order) => order.items.map((item) => item.material.id))
  const [references, images] = await Promise.all([
    loadCustomerMaterialDeliveryReferences(orders.flatMap((order) => order.items.map((item) => ({ customerId: order.customerId, materialId: item.material.id })))),
    loadPrimaryMaterialImageMap(materialIds),
  ])
  const data = orders.map((order) => ({
    ...order,
    items: order.items.map((item) => {
      const reference = references.get(deliveryReferenceKey(order.customerId, item.materialId))
      return {
        ...item,
        material: { ...item.material, primaryImage: images.get(item.materialId) || null },
        referenceOrderedQty: reference?.orderedQty || 0,
        referencePendingQty: reference?.pendingQty || 0,
        referenceShippedQty: reference?.shippedQty || 0,
        referenceRemainingQty: reference?.remainingQty || 0,
        referenceOverQty: reference?.overQty || 0,
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
  const images = await loadPrimaryMaterialImageMap(materials.map((material) => material.id))
  return { customers, materials: materials.map((material) => ({ ...material, primaryImage: images.get(material.id) || null })) }
}

export async function getShipmentCreateOptions(scope: EffectiveDataScope = unrestrictedDataScope) {
  const locationBalanceWhere = scope.inventoryMode === 'LOCATIONS'
    ? { locationId: { in: scope.locationIds } }
    : undefined
  const [customers, materials, references] = await Promise.all([
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
    loadCustomerMaterialDeliveryReferences(undefined, scope),
  ])
  const images = await loadPrimaryMaterialImageMap(materials.map((material) => material.id))
  return { data: Array.from(references.values()), customers, materials: materials.map((material) => ({ ...material, primaryImage: images.get(material.id) || null })) }
}
