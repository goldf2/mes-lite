import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// GET: 仪表盘汇总
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dashboard', 'read')
    if (denied) return denied

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      todayOrderCount,
      monthOrderCount,
      statusDistribution,
      todayProductionAgg,
      monthProductionAgg,
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
          material: { select: { id: true, code: true, name: true, spec: true, unit: true } },
          product: { select: { id: true, sku: true, name: true, category: true, unit: true } },
        },
      }),
    ])

    return NextResponse.json({
      data: {
        todayOrderCount,
        monthOrderCount,
        statusDistribution: statusDistribution.map((s) => ({
          status: s.status,
          count: s._count,
        })),
        todayProduction: todayProductionAgg._sum.goodQty ?? 0,
        monthProduction: monthProductionAgg._sum.goodQty ?? 0,
        pendingMaterialInCount,
        pendingShipmentCount,
        pendingReturnCount,
        lowStocks,
      },
    })
  } catch (error) {
    console.error('Get dashboard error:', error)
    return NextResponse.json({ error: '获取仪表盘数据失败' }, { status: 500 })
  }
}
