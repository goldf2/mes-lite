import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('profileStock', 'read')
    if (denied) return denied

    const entity = await prisma.profileStockEntity.findUnique({
      where: { id: params.id },
      select: { id: true, entityNo: true },
    })
    if (!entity) return NextResponse.json({ error: '型材实体不存在' }, { status: 404 })

    const movements = await prisma.profileStockMovement.findMany({
      where: { entityId: entity.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: movements, entity })
  } catch (error) {
    console.error('Get profile stock movements error:', error)
    return NextResponse.json({ error: '获取实体流水失败' }, { status: 500 })
  }
}
