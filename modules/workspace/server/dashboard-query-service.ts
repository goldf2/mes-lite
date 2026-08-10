import { prisma } from '@/lib/prisma'
import { buildProductionFlowDashboard } from '../domain/dashboard-production'

const STOCK_BALANCE_FIELDS = [
  'qty',
  'reservedQty',
  'availableQty',
  'valuationQty',
  'reservedValuationQty',
  'availableValuationQty',
  'totalCost',
] as const

function hasStockBalance(stock: Record<string, unknown>) {
  return STOCK_BALANCE_FIELDS.some((field) => Math.abs(Number(stock[field] || 0)) > 0.000001)
}

export async function getDashboardData(now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [
    todayOrderCount,
    monthOrderCount,
    statusDistribution,
    todayProductionActualCount,
    monthProductionActualCount,
    productionActualStatusDistribution,
    todayProductionActualOutputAgg,
    monthProductionActualOutputAgg,
    pendingProductionActualCount,
    pendingMaterialInCount,
    pendingShipmentCount,
    pendingReturnCount,
    lowStocks,
  ] = await Promise.all([
    prisma.productionOrder.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.productionOrder.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.productionOrder.groupBy({ by: ['status'], _count: true }),
    prisma.productionOrderActual.count({ where: { actualDate: { gte: todayStart, lt: tomorrowStart }, status: { in: ['DRAFT', 'CONFIRMED'] } } }),
    prisma.productionOrderActual.count({ where: { actualDate: { gte: monthStart, lt: nextMonthStart }, status: { in: ['DRAFT', 'CONFIRMED'] } } }),
    prisma.productionOrderActual.groupBy({ by: ['status'], _count: true }),
    prisma.productionOrderActualOutput.aggregate({ where: { isPrimary: true, actual: { is: { actualDate: { gte: todayStart, lt: tomorrowStart }, status: 'CONFIRMED' } } }, _sum: { actualQty: true } }),
    prisma.productionOrderActualOutput.aggregate({ where: { isPrimary: true, actual: { is: { actualDate: { gte: monthStart, lt: nextMonthStart }, status: 'CONFIRMED' } } }, _sum: { actualQty: true } }),
    prisma.productionOrderActual.count({ where: { status: 'DRAFT' } }),
    prisma.materialReceipt.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.shipment.count({ where: { status: 'PENDING' } }),
    prisma.returnOrder.count({ where: { status: 'PENDING' } }),
    prisma.stock.findMany({
      where: { availableQty: { lt: 10 } },
      include: {
        material: { select: { id: true, code: true, name: true, spec: true, unit: true, deletedAt: true } },
        product: { select: { id: true, sku: true, name: true, category: true, unit: true } },
      },
    }),
  ])

  return {
    ...buildProductionFlowDashboard({
      todayOrderCount,
      monthOrderCount,
      todayProductionActualCount,
      monthProductionActualCount,
      todayProductionActualOutput: todayProductionActualOutputAgg._sum.actualQty ?? 0,
      monthProductionActualOutput: monthProductionActualOutputAgg._sum.actualQty ?? 0,
    }),
    statusDistribution: statusDistribution.map((item) => ({ status: item.status, count: item._count })),
    productionActualStatusDistribution: productionActualStatusDistribution.map((item) => ({ status: item.status, count: item._count })),
    pendingProductionActualCount,
    pendingMaterialInCount,
    pendingShipmentCount,
    pendingReturnCount,
    lowStocks: lowStocks.filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock)),
  }
}
