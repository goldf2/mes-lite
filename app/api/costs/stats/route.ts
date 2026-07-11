import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// GET: 成本统计
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const groupBy = searchParams.get('groupBy') // costType/category/date

    const where: any = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(endDate)
    }

    const [totalAgg, byType, byCategory] = await Promise.all([
      prisma.costRecord.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.costRecord.groupBy({
        by: ['costType'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.costRecord.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
      }),
    ])

    return NextResponse.json({
      data: {
        totalCost: totalAgg._sum.amount ?? 0,
        byType: byType.map((t) => ({
          costType: t.costType,
          totalAmount: t._sum.amount ?? 0,
          count: t._count,
        })),
        byCategory: byCategory.map((c) => ({
          category: c.category,
          totalAmount: c._sum.amount ?? 0,
        })),
      },
    })
  } catch (error) {
    console.error('Get cost stats error:', error)
    return NextResponse.json({ error: '获取成本统计失败' }, { status: 500 })
  }
}
