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
      include: { items: true },
    })
    if (!order) return NextResponse.json({ error: '销售订单不存在' }, { status: 404 })
    if (order.status !== 'DRAFT') return NextResponse.json({ error: '只能确认草稿状态的销售订单' }, { status: 400 })
    if (order.items.length === 0) return NextResponse.json({ error: '销售订单没有明细' }, { status: 400 })

    const updated = await prisma.salesOrder.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'SALES_ORDER',
      entityId: order.id,
      entityLabel: order.orderNo,
      beforeData: order,
      afterData: updated,
    })
    return NextResponse.json({ data: updated, message: '销售订单已确认' })
  } catch (error) {
    console.error('Confirm sales order error:', error)
    return NextResponse.json({ error: '确认销售订单失败' }, { status: 500 })
  }
}
