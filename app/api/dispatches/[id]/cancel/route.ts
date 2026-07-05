import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dispatch = await prisma.dispatch.findUnique({
      where: { id: params.id },
    })

    if (!dispatch) {
      return NextResponse.json({ error: '派工单不存在' }, { status: 404 })
    }

    if (dispatch.status !== 'PENDING' && dispatch.status !== 'DISPATCHED') {
      return NextResponse.json(
        { error: '只能取消待派工或已派工状态的派工单' },
        { status: 400 }
      )
    }

    const updated = await prisma.dispatch.update({
      where: { id: params.id },
      data: {
        status: 'CANCELLED',
      },
    })

    return NextResponse.json({
      success: true,
      message: `派工单 ${updated.dispatchNo} 已取消`,
      data: updated,
    })
  } catch (error) {
    console.error('Cancel dispatch error:', error)
    return NextResponse.json({ error: '取消派工失败' }, { status: 500 })
  }
}
