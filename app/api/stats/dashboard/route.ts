import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { buildProductionFlowDashboard } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

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

// GET: 仪表盘汇总
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dashboard', 'read')
    if (denied) return denied

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [
      todayOrderCount,
      monthOrderCount,
      statusDistribution,
      todayWorkReportProductionAgg,
      monthWorkReportProductionAgg,
      todayDailyReportCount,
      monthDailyReportCount,
      dailyReportStatusDistribution,
      todayDailyReportProductionAgg,
      monthDailyReportProductionAgg,
      pendingDailyReportCount,
      pendingMaterialInCount,
      pendingShipmentCount,
      pendingReturnCount,
      lowStocks,
    ] = await Promise.all([
      prisma.productionOrder.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.productionOrder.count({
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.productionOrder.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.workReport.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { goodQty: true },
      }),
      prisma.workReport.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { goodQty: true },
      }),
      prisma.dailyProductionReport.count({
        where: {
          reportDate: { gte: todayStart, lt: tomorrowStart },
          status: { in: ['DRAFT', 'CONFIRMED'] },
        },
      }),
      prisma.dailyProductionReport.count({
        where: {
          reportDate: { gte: monthStart, lt: nextMonthStart },
          status: { in: ['DRAFT', 'CONFIRMED'] },
        },
      }),
      prisma.dailyProductionReport.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.dailyProductionReport.aggregate({
        where: {
          reportDate: { gte: todayStart, lt: tomorrowStart },
          status: 'CONFIRMED',
        },
        _sum: { outputQty: true },
      }),
      prisma.dailyProductionReport.aggregate({
        where: {
          reportDate: { gte: monthStart, lt: nextMonthStart },
          status: 'CONFIRMED',
        },
        _sum: { outputQty: true },
      }),
      prisma.dailyProductionReport.count({
        where: { status: 'DRAFT' },
      }),
      prisma.materialIn.count({
        where: { status: 'PENDING' },
      }),
      prisma.shipment.count({
        where: { status: 'PENDING' },
      }),
      prisma.returnOrder.count({
        where: { status: 'PENDING' },
      }),
      prisma.stock.findMany({
        where: { availableQty: { lt: 10 } },
        include: {
          material: { select: { id: true, code: true, name: true, spec: true, unit: true, deletedAt: true } },
          product: { select: { id: true, sku: true, name: true, category: true, unit: true } },
        },
      }),
    ])

    const productionFlow = buildProductionFlowDashboard({
      todayOrderCount,
      monthOrderCount,
      todayDailyReportCount,
      monthDailyReportCount,
      todayWorkReportProduction: todayWorkReportProductionAgg._sum.goodQty ?? 0,
      monthWorkReportProduction: monthWorkReportProductionAgg._sum.goodQty ?? 0,
      todayDailyReportProduction: todayDailyReportProductionAgg._sum.outputQty ?? 0,
      monthDailyReportProduction: monthDailyReportProductionAgg._sum.outputQty ?? 0,
    })

    return NextResponse.json({
      data: {
        ...productionFlow,
        statusDistribution: statusDistribution.map((s) => ({
          status: s.status,
          count: s._count,
        })),
        dailyReportStatusDistribution: dailyReportStatusDistribution.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        pendingDailyReportCount,
        pendingMaterialInCount,
        pendingShipmentCount,
        pendingReturnCount,
        lowStocks: lowStocks.filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock)),
      },
    })
  } catch (error) {
    console.error('Get dashboard error:', error)
    return NextResponse.json({ error: '获取仪表盘数据失败' }, { status: 500 })
  }
}
