import { Prisma } from '@prisma/client'

export async function getSalesOrderItemRemainingQty(
  tx: Prisma.TransactionClient,
  salesOrderItemId: string,
) {
  const item = await tx.salesOrderItem.findUnique({
    where: { id: salesOrderItemId },
    include: {
      material: {
        select: {
          id: true,
          code: true,
          name: true,
          spec: true,
          category: true,
          stockUnit: true,
          unit: true,
          deletedAt: true,
        },
      },
      salesOrder: {
        include: {
          customer: { select: { id: true, name: true, phone: true, address: true, deletedAt: true } },
        },
      },
    },
  })
  if (!item) throw new Error('销售订单明细不存在')

  const pending = await tx.shipment.aggregate({
    where: { salesOrderItemId, status: 'PENDING', deletedAt: null },
    _sum: { qty: true },
  })
  const pendingQty = Number(pending._sum.qty || 0)
  const remainingQty = Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))
  return { item, pendingQty, remainingQty }
}

export async function refreshSalesOrderStatus(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { items: { select: { qty: true, shippedQty: true } } },
  })
  if (!order || order.status === 'CANCELLED') return order

  const shippedQty = order.items.reduce((sum, item) => sum + Number(item.shippedQty), 0)
  const completed = order.items.length > 0
    && order.items.every((item) => Number(item.shippedQty) >= Number(item.qty) - 0.000001)
  const status = completed ? 'COMPLETED' : shippedQty > 0 ? 'PARTIAL' : 'CONFIRMED'
  if (status === order.status) return order
  return tx.salesOrder.update({ where: { id: salesOrderId }, data: { status } })
}
