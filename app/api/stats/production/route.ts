import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: 产量统计
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const groupBy = searchParams.get('groupBy') ?? 'product' // product/worker/status

    const dateWhere: any = {}
    if (startDate || endDate) {
      dateWhere.createdAt = {}
      if (startDate) dateWhere.createdAt.gte = new Date(startDate)
      if (endDate) dateWhere.createdAt.lte = new Date(endDate)
    }

    let data: any[] = []

    if (groupBy === 'worker') {
      const grouped = await prisma.workReport.groupBy({
        by: ['workerName'],
        where: dateWhere,
        _sum: { goodQty: true, badQty: true },
        _count: true,
      })
      data = grouped.map((g) => ({
        workerName: g.workerName,
        goodQty: g._sum.goodQty ?? 0,
        badQty: g._sum.badQty ?? 0,
        reportCount: g._count,
      }))
    } else if (groupBy === 'status') {
      const grouped = await prisma.productionOrder.groupBy({
        by: ['status'],
        where: dateWhere,
        _count: true,
      })
      data = grouped.map((g) => ({
        status: g.status,
        orderCount: g._count,
      }))
    } else {
      // 默认按产品分组
      const grouped = await prisma.productionOrder.groupBy({
        by: ['productId'],
        where: dateWhere,
        _sum: { planQty: true, completeQty: true, scrapQty: true },
        _count: true,
      })
      const productIds = grouped.map((g) => g.productId)
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      })
      const productMap = new Map(products.map((p) => [p.id, p]))
      data = grouped.map((g) => ({
        productId: g.productId,
        productName: productMap.get(g.productId)?.name ?? '',
        productSku: productMap.get(g.productId)?.sku ?? '',
        planQty: g._sum.planQty ?? 0,
        completeQty: g._sum.completeQty ?? 0,
        scrapQty: g._sum.scrapQty ?? 0,
        orderCount: g._count,
      }))
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Get production stats error:', error)
    return NextResponse.json({ error: '获取产量统计失败' }, { status: 500 })
  }
}
