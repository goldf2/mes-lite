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

    if (dispatch.status !== 'DISPATCHED') {
      return NextResponse.json(
        { error: '只能开始已派工状态的派工单' },
        { status: 400 }
      )
    }

    const updated = await prisma.dispatch.update({
      where: { id: params.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `派工单 ${updated.dispatchNo} 已开始生产`,
      data: updated,
    })
  } catch (error) {
    console.error('Start dispatch error:', error)
    return NextResponse.json({ error: '开始生产失败' }, { status: 500 })
  }
}
