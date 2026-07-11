import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

// PATCH: 取消发货
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied

    const shipment = await prisma.shipment.findUnique({
      where: { id: params.id },
    })

    if (!shipment) {
      return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
    }

    if (shipment.status !== 'PENDING') {
      return NextResponse.json(
        { error: '已发货的发货单不可取消，请走退货流程' },
        { status: 400 }
      )
    }

    await prisma.shipment.update({
      where: { id: params.id },
      data: {
        status: 'CANCELLED',
      },
    })

    return NextResponse.json({ success: true, message: '发货单已取消' })
  } catch (error) {
    console.error('Cancel shipment error:', error)
    return NextResponse.json({ error: '取消发货失败' }, { status: 500 })
  }
}
