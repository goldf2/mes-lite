import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('dispatch', 'read')
    if (denied) return denied

    const dispatch = await prisma.dispatch.findUnique({
      where: { id: params.id },
      include: {
        order: { include: { product: true, targetMaterial: true } },
        step: true,
      },
    })

    if (!dispatch) {
      return NextResponse.json({ error: '派工单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: dispatch })
  } catch (error) {
    console.error('Get dispatch detail error:', error)
    return NextResponse.json({ error: '获取派工单详情失败' }, { status: 500 })
  }
}
