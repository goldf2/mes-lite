import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyStatusFilter } from '@/lib/status-filter'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

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
  applyStatusFilter(statusWhere, query.statuses)
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
