import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { productionCostRecordInclude } from './production-cost-record-select'

export interface ProductionCostRecordQuery {
  costType?: string | null
  startDate?: string | null
  endDate?: string | null
  page: number
  pageSize: number
}

function costRecordWhere(query: Pick<ProductionCostRecordQuery, 'costType' | 'startDate' | 'endDate'>) {
  const where: Prisma.CostRecordWhereInput = {}
  if (query.costType) where.costType = query.costType
  if (query.startDate || query.endDate) {
    where.date = {
      ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
      ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
    }
  }
  return where
}

export async function listProductionCostRecords(query: ProductionCostRecordQuery) {
  const where = costRecordWhere(query)
  const [records, total] = await Promise.all([
    prisma.costRecord.findMany({
      where, include: productionCostRecordInclude, orderBy: { date: 'desc' },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.costRecord.count({ where }),
  ])
  return {
    data: records,
    pagination: {
      page: query.page, pageSize: query.pageSize, total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export async function summarizeProductionCosts(input: { startDate?: string | null; endDate?: string | null }) {
  const where = costRecordWhere(input)
  const [totalAgg, byType, byCategory] = await Promise.all([
    prisma.costRecord.aggregate({ where, _sum: { amount: true } }),
    prisma.costRecord.groupBy({ by: ['costType'], where, _sum: { amount: true }, _count: true }),
    prisma.costRecord.groupBy({ by: ['category'], where, _sum: { amount: true } }),
  ])
  return {
    totalCost: totalAgg._sum.amount ?? 0,
    byType: byType.map((item) => ({
      costType: item.costType, totalAmount: item._sum.amount ?? 0, count: item._count,
    })),
    byCategory: byCategory.map((item) => ({
      category: item.category, totalAmount: item._sum.amount ?? 0,
    })),
  }
}

export async function listProductionOrderCosts(orderId: string) {
  const records = await prisma.costRecord.findMany({
    where: { orderId }, include: { order: true }, orderBy: { date: 'desc' },
  })
  return { data: records, totalAmount: records.reduce((sum, record) => sum + Number(record.amount), 0) }
}
