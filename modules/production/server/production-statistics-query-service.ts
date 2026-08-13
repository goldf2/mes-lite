import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  productionOrderDataScopeWhere,
  unrestrictedDataScope,
  workReportDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'

function createdAtWhere(input: { startDate?: string | null; endDate?: string | null }) {
  return input.startDate || input.endDate ? {
    createdAt: {
      ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
      ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
    },
  } : {}
}

export async function getProductionStatistics(
  input: { startDate?: string | null; endDate?: string | null; groupBy: string },
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const orderWhere: Prisma.ProductionOrderWhereInput = { ...createdAtWhere(input), ...productionOrderDataScopeWhere(scope) }
  if (input.groupBy === 'worker') {
    const grouped = await prisma.workReport.groupBy({ by: ['workerName'], where: { ...createdAtWhere(input), ...workReportDataScopeWhere(scope) }, _sum: { goodQty: true, badQty: true }, _count: true })
    return grouped.map((item) => ({ workerName: item.workerName, goodQty: item._sum.goodQty ?? 0, badQty: item._sum.badQty ?? 0, reportCount: item._count }))
  }
  if (input.groupBy === 'status') {
    const grouped = await prisma.productionOrder.groupBy({ by: ['status'], where: orderWhere, _count: true })
    return grouped.map((item) => ({ status: item.status, orderCount: item._count }))
  }
  const grouped = await prisma.productionOrder.groupBy({
    by: ['productId'], where: orderWhere, _sum: { planQty: true, completeQty: true, scrapQty: true }, _count: true,
  })
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((item) => item.productId) } }, select: { id: true, name: true, sku: true },
  })
  const productMap = new Map(products.map((item) => [item.id, item]))
  return grouped.map((item) => ({
    productId: item.productId, productName: productMap.get(item.productId)?.name ?? '', productSku: productMap.get(item.productId)?.sku ?? '',
    planQty: item._sum.planQty ?? 0, completeQty: item._sum.completeQty ?? 0, scrapQty: item._sum.scrapQty ?? 0, orderCount: item._count,
  }))
}

export async function getQualityStatistics(
  input: { startDate?: string | null; endDate?: string | null },
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const where: Prisma.WorkReportWhereInput = { ...createdAtWhere(input), ...workReportDataScopeWhere(scope) }
  const [totalAgg, grouped] = await Promise.all([
    prisma.workReport.aggregate({ where, _sum: { goodQty: true, badQty: true } }),
    prisma.workReport.groupBy({ by: ['orderId'], where, _sum: { goodQty: true, badQty: true }, _count: true }),
  ])
  const orders = await prisma.productionOrder.findMany({
    where: { id: { in: grouped.map((item) => item.orderId) } },
    select: { id: true, orderNo: true, product: { select: { id: true, name: true, sku: true } } },
  })
  const orderMap = new Map(orders.map((item) => [item.id, item]))
  const totalGood = totalAgg._sum.goodQty ?? 0
  const totalBad = totalAgg._sum.badQty ?? 0
  const total = totalGood + totalBad
  return {
    totalGood, totalBad, passRate: total ? totalGood / total * 100 : 0, badRate: total ? totalBad / total * 100 : 0,
    byOrder: grouped.map((item) => {
      const order = orderMap.get(item.orderId)
      const goodQty = item._sum.goodQty ?? 0
      const badQty = item._sum.badQty ?? 0
      const sum = goodQty + badQty
      return {
        orderId: item.orderId, orderNo: order?.orderNo ?? '', product: order?.product ?? null,
        goodQty, badQty, reportCount: item._count,
        passRate: sum ? goodQty / sum * 100 : 0, badRate: sum ? badQty / sum * 100 : 0,
      }
    }),
  }
}
