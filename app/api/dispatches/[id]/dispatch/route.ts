import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('dispatch', 'update')
    if (denied) return denied

    const dispatch = await prisma.dispatch.findUnique({
      where: { id: params.id },
    })

    if (!dispatch) {
      return NextResponse.json({ error: '派工单不存在' }, { status: 404 })
    }

    if (dispatch.status !== 'PENDING') {
      return NextResponse.json(
        { error: '只能确认待派工状态的派工单' },
        { status: 400 }
      )
    }

    const updated = await prisma.dispatch.update({
      where: { id: params.id },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `派工单 ${updated.dispatchNo} 已确认派工`,
      data: updated,
    })
  } catch (error) {
    console.error('Confirm dispatch error:', error)
    return NextResponse.json({ error: '确认派工失败' }, { status: 500 })
  }
}
