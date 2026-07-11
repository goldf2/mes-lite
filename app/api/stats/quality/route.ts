import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// GET: 质量统计
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {}
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    const [totalAgg, byOrderGrouped] = await Promise.all([
      prisma.workReport.aggregate({
        where,
        _sum: { goodQty: true, badQty: true },
      }),
      prisma.workReport.groupBy({
        by: ['orderId'],
        where,
        _sum: { goodQty: true, badQty: true },
        _count: true,
      }),
    ])

    const orderIds = byOrderGrouped.map((g) => g.orderId)
    const orders = await prisma.productionOrder.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        orderNo: true,
        product: { select: { id: true, name: true, sku: true } },
      },
    })
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    const totalGood = totalAgg._sum.goodQty ?? 0
    const totalBad = totalAgg._sum.badQty ?? 0
    const total = totalGood + totalBad
    const passRate = total > 0 ? (totalGood / total) * 100 : 0
    const badRate = total > 0 ? (totalBad / total) * 100 : 0

    const byOrder = byOrderGrouped.map((g) => {
      const order = orderMap.get(g.orderId)
      const good = g._sum.goodQty ?? 0
      const bad = g._sum.badQty ?? 0
      const sum = good + bad
      return {
        orderId: g.orderId,
        orderNo: order?.orderNo ?? '',
        product: order?.product ?? null,
        goodQty: good,
        badQty: bad,
        reportCount: g._count,
        passRate: sum > 0 ? (good / sum) * 100 : 0,
        badRate: sum > 0 ? (bad / sum) * 100 : 0,
      }
    })

    return NextResponse.json({
      data: {
        totalGood,
        totalBad,
        passRate,
        badRate,
        byOrder,
      },
    })
  } catch (error) {
    console.error('Get quality stats error:', error)
    return NextResponse.json({ error: '获取质量统计失败' }, { status: 500 })
  }
}
