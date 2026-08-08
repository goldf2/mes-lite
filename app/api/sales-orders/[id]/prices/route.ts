import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuditContext, createAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'

const updatePriceSchema = z.object({
  reason: z.string().trim().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    unitPrice: z.number().finite().nonnegative('单价不能小于 0'),
  })).min(1, '请至少提交一条销售明细'),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'update')
    if (denied) return denied

    const input = updatePriceSchema.parse(await req.json())
    const order = await prisma.salesOrder.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: { shipments: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    })
    if (!order) return NextResponse.json({ error: '销售订单不存在或已归档' }, { status: 404 })
    if (!['DRAFT', 'CONFIRMED'].includes(order.status)) {
      return NextResponse.json({ error: '只有草稿或尚未执行的已确认订单可以调整价格' }, { status: 400 })
    }
    if (order.items.some((item) => item.shipments.length > 0)) {
      return NextResponse.json({ error: '订单已经产生发货记录，价格已锁定' }, { status: 400 })
    }
    if (order.status !== 'DRAFT' && !input.reason) {
      return NextResponse.json({ error: '已确认订单调价必须填写原因' }, { status: 400 })
    }

    const inputById = new Map(input.items.map((item) => [item.id, item.unitPrice]))
    if (inputById.size !== order.items.length || order.items.some((item) => !inputById.has(item.id))) {
      return NextResponse.json({ error: '销售明细与当前订单不一致，请刷新后重试' }, { status: 400 })
    }

    const auditContext = await getAuditContext(req)
    const changedAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const unitPrice = inputById.get(item.id)!
        await tx.salesOrderItem.update({
          where: { id: item.id },
          data: {
            unitPrice,
            totalAmount: Number(item.qty) * unitPrice,
            priceSource: 'MANUAL',
            priceAdjustedAt: changedAt,
            priceAdjustedBy: auditContext.operatorName || auditContext.operatorId || null,
            priceAdjustReason: input.reason || null,
          },
        })
      }
      const totalAmount = order.items.reduce((sum, item) => sum + Number(item.qty) * inputById.get(item.id)!, 0)
      const nextOrder = await tx.salesOrder.update({
        where: { id: order.id },
        data: { totalAmount },
        include: { customer: true, items: { include: { material: true } } },
      })
      await createAuditLog(tx, auditContext, {
        action: 'ADJUST_PRICE',
        entityType: 'SALES_ORDER',
        entityId: order.id,
        entityLabel: order.orderNo,
        beforeData: order.items.map((item) => ({ id: item.id, unitPrice: item.unitPrice, totalAmount: item.totalAmount })),
        afterData: nextOrder.items.map((item) => ({ id: item.id, unitPrice: item.unitPrice, totalAmount: item.totalAmount })),
        note: input.reason || '草稿价格调整',
      })
      return nextOrder
    })

    return NextResponse.json({ data: updated, message: '销售订单价格已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Adjust sales order price error:', error)
    return NextResponse.json({ error: '调整销售订单价格失败' }, { status: 500 })
  }
}
