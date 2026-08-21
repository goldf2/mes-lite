import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyStatusFilter } from '@/lib/status-filter'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { expandProductionOrderStatusFilters } from '../domain/production-order-status'
import { productionOrderDataScopeWhere, type EffectiveDataScope } from '@/modules/identity-access'
import { productionOrderStatusOptions } from '../model/production-order-view'

export interface ProductionOrderListQuery {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
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
  return condition.operator === 'gt' ? { gt: value } : condition.operator === 'gte' ? { gte: value } : condition.operator === 'lt' ? { lt: value } : condition.operator === 'lte' ? { lte: value } : { equals: value }
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

export async function listProductionOrders(query: ProductionOrderListQuery, scope?: EffectiveDataScope) {
  const where: Prisma.ProductionOrderWhereInput = { deletedAt: null }
  const andConditions: Prisma.ProductionOrderWhereInput[] = []
  if (scope) andConditions.push(productionOrderDataScopeWhere(scope))
  const statusWhere: { status?: string | { in: string[] } } = {}
  applyStatusFilter(statusWhere, expandProductionOrderStatusFilters(query.statuses))
  Object.assign(where, statusWhere)

  if (query.customerId === '__UNASSIGNED__') {
    andConditions.push({ OR: [
      { product: { is: { customerId: null } } },
      { targetMaterial: { is: { customerId: null } } },
    ] })
  } else if (query.customerId) {
    andConditions.push({ OR: [
      { product: { is: { customerId: query.customerId } } },
      { targetMaterial: { is: { customerId: query.customerId } } },
    ] })
  }
  for (const condition of query.advancedConditions || []) {
    const text = stringFilter(condition)
    if (condition.field === 'orderNo' || condition.field === 'groupNo' || condition.field === 'voucherNo') andConditions.push({ [condition.field]: text } as Prisma.ProductionOrderWhereInput)
    else if (condition.field === 'status') andConditions.push({ status: condition.value })
    else if (condition.field === 'customerId') {
      const customerId = condition.value === '__UNASSIGNED__' ? null : condition.value
      andConditions.push({ OR: [{ product: { is: { customerId } } }, { targetMaterial: { is: { customerId } } }] })
    } else if (condition.field === 'target') andConditions.push({ OR: [{ product: { is: { OR: [{ sku: text }, { name: text }] } } }, { targetMaterial: { is: { OR: [{ code: text }, { name: text }, { spec: text }] } } }] })
    else if (condition.field === 'bom') andConditions.push({ OR: [{ bom: { is: { OR: [{ name: text }, { version: text }] } } }, { bomName: text }, { bomVersion: text }] })
    else if (condition.field === 'planQty' || condition.field === 'completeQty' || condition.field === 'scrapQty') {
      const value = numberFilter(condition)
      if (value) andConditions.push({ [condition.field]: value } as Prisma.ProductionOrderWhereInput)
    } else if (condition.field === 'createdAt') {
      const value = dateFilter(condition)
      if (value) andConditions.push({ createdAt: value })
    }
  }

  andConditions.push(...tokenizeKeywordQuery(query.keyword || '').map((token): Prisma.ProductionOrderWhereInput => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { orderNo: { contains: token } },
    { groupNo: { contains: token } },
    { voucherNo: { contains: token } },
    { product: { is: { sku: { contains: token } } } },
    { product: { is: { name: { contains: token } } } },
    { targetMaterial: { is: { code: { contains: token } } } },
    { targetMaterial: { is: { name: { contains: token } } } },
    { targetMaterial: { is: { spec: { contains: token } } } },
    { bom: { is: { name: { contains: token } } } }, { bom: { is: { version: { contains: token } } } },
    { product: { is: { customer: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } } } },
    { targetMaterial: { is: { customer: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } } } },
    ...productionOrderStatusOptions.filter((option) => option.label.toLocaleLowerCase('zh-CN').includes(token)).map((option) => ({ status: option.value })),
    ...(Number.isFinite(number) ? [{ planQty: number }, { completeQty: number }, { scrapQty: number }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ createdAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
  if (andConditions.length > 0) where.AND = andConditions

  const [items, total] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
        targetMaterial: { select: { id: true, name: true, code: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, valuationUnit: true } },
        bom: { select: { id: true, name: true, version: true } },
        _count: { select: { reports: true, picks: true, actuals: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.productionOrder.count({ where }),
  ])

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export async function getProductionOrderDetail(id: string, scope?: EffectiveDataScope) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, ...(scope ? productionOrderDataScopeWhere(scope) : {}) },
    include: {
      product: true,
      targetMaterial: true,
      bom: { select: { id: true, name: true, version: true } },
      picks: { include: { material: true }, orderBy: { createdAt: 'asc' } },
      reports: { include: { step: true }, orderBy: { createdAt: 'asc' } },
      qcRecords: { orderBy: { checkedAt: 'desc' } },
      stockIns: true,
      _count: { select: { actuals: true } },
    },
  })
  if (!order) return null

  const [groupLines, route] = await Promise.all([
    order.groupNo ? prisma.productionOrder.findMany({
      where: { groupNo: order.groupNo, deletedAt: null, ...(scope ? productionOrderDataScopeWhere(scope) : {}) },
      include: {
        product: true,
        targetMaterial: true,
        bom: { select: { id: true, name: true, version: true } },
        _count: { select: { actuals: true } },
      },
      orderBy: { lineNo: 'asc' },
    }) : Promise.resolve([]),
    prisma.processRoute.findFirst({
      where: { productId: order.productId, isDefault: true },
      include: { steps: { orderBy: { stepNo: 'asc' } } },
    }),
  ])
  const currentStepId = route?.steps.find((step) => (
    !order.reports.some((report) => report.stepId === step.id && report.endTime)
  ))?.id ?? null
  return { ...order, groupLines, currentStepId, routeSteps: route?.steps ?? [] }
}

export async function listProductionOrderOptions() {
  const boms = await prisma.bOM.findMany({
    where: { status: 'RELEASED' },
    select: {
      id: true,
      name: true,
      version: true,
      isDefault: true,
      outputs: {
        where: { isPrimary: true },
        select: { material: { select: { id: true, code: true, name: true, spec: true, category: true, unit: true, stockUnit: true, valuationUnit: true } } },
      },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    take: 1000,
  })
  const byMaterial = new Map<string, {
    id: string; code: string; name: string; spec: string | null; category: string; unit: string; stockUnit: string; valuationUnit: string
    boms: Array<{ id: string; name: string; version: string; isDefault: boolean }>
  }>()
  for (const bom of boms) {
    const material = bom.outputs[0]?.material
    if (!material) continue
    const current = byMaterial.get(material.id) || { ...material, boms: [] }
    current.boms.push({ id: bom.id, name: bom.name, version: bom.version, isDefault: bom.isDefault })
    byMaterial.set(material.id, current)
  }
  return Array.from(byMaterial.values()).sort((left, right) => left.code.localeCompare(right.code, 'zh-CN', { numeric: true }))
}
