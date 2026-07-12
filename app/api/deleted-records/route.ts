import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const model = searchParams.get('model') || 'all'

    const result: Record<string, unknown[]> = {}

    if (model === 'all' || model === 'materialIn') {
      result.materialIn = await prisma.materialIn.findMany({
        where: { deletedAt: { not: null } },
        include: { supplier: true, material: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'order') {
      result.orders = await prisma.productionOrder.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'dispatch') {
      result.dispatches = await prisma.dispatch.findMany({
        where: { deletedAt: { not: null } },
        include: { order: true, step: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'shipment') {
      result.shipments = await prisma.shipment.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'return') {
      result.returns = await prisma.returnOrder.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Get deleted records error:', error)
    return NextResponse.json({ error: '获取已删除记录失败' }, { status: 500 })
  }
}
