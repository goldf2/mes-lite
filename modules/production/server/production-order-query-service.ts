import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyStatusFilter } from '@/lib/status-filter'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { expandProductionOrderStatusFilters } from '../domain/production-order-status'

export interface ProductionOrderListQuery {
  statuses: string[]
  keyword?: string | null
  customerId?: string | null
  page: number
  pageSize: number
}

export async function listProductionOrders(query: ProductionOrderListQuery) {
  const where: Prisma.ProductionOrderWhereInput = { deletedAt: null }
  const andConditions: Prisma.ProductionOrderWhereInput[] = []
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

  andConditions.push(...tokenizeKeywordQuery(query.keyword || '').map((token): Prisma.ProductionOrderWhereInput => ({ OR: [
    { orderNo: { contains: token } },
    { groupNo: { contains: token } },
    { voucherNo: { contains: token } },
    { product: { is: { sku: { contains: token } } } },
    { product: { is: { name: { contains: token } } } },
    { targetMaterial: { is: { code: { contains: token } } } },
    { targetMaterial: { is: { name: { contains: token } } } },
    { targetMaterial: { is: { spec: { contains: token } } } },
  ] })))
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

export async function getProductionOrderDetail(id: string) {
  const order = await prisma.productionOrder.findUnique({
    where: { id },
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
      where: { groupNo: order.groupNo, deletedAt: null },
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
