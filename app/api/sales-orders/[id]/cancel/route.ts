import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'update')
    if (denied) return denied

    const order = await prisma.salesOrder.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { shipments: { where: { status: { not: 'CANCELLED' }, deletedAt: null }, select: { id: true } } },
    })
    if (!order) return NextResponse.json({ error: '销售订单不存在' }, { status: 404 })
    if (!['DRAFT', 'CONFIRMED'].includes(order.status)) return NextResponse.json({ error: '当前状态不能取消销售订单' }, { status: 400 })
    if (order.shipments.length > 0) return NextResponse.json({ error: '订单已有发货单，请先取消待发货单' }, { status: 400 })

    const updated = await prisma.salesOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
    await writeAuditLog(req, {
      action: 'CANCEL',
      entityType: 'SALES_ORDER',
      entityId: order.id,
      entityLabel: order.orderNo,
      beforeData: order,
      afterData: updated,
    })
    return NextResponse.json({ data: updated, message: '销售订单已取消' })
  } catch (error) {
    console.error('Cancel sales order error:', error)
    return NextResponse.json({ error: '取消销售订单失败' }, { status: 500 })
  }
}
