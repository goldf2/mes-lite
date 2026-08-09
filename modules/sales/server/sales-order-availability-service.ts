import type { Prisma } from '@prisma/client'
import { SalesDomainError } from '../domain/sales-errors'
import { salesOrderFulfillmentStatus } from '../domain/sales-order-status'

export async function getSalesOrderItemRemainingQty(
  tx: Prisma.TransactionClient,
  salesOrderItemId: string,
) {
  const item = await tx.salesOrderItem.findUnique({
    where: { id: salesOrderItemId },
    include: {
      material: {
        select: {
          id: true, code: true, name: true, spec: true, category: true,
          stockUnit: true, unit: true, deletedAt: true,
        },
      },
      salesOrder: {
        include: { customer: { select: { id: true, name: true, phone: true, address: true, deletedAt: true } } },
      },
    },
  })
  if (!item) throw new SalesDomainError('销售订单明细不存在', 404)
  const pending = await tx.shipment.aggregate({
    where: { salesOrderItemId, status: 'PENDING', deletedAt: null },
    _sum: { qty: true },
  })
  const pendingQty = Number(pending._sum.qty || 0)
  const remainingQty = Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))
  return { item, pendingQty, remainingQty }
}

export async function refreshSalesOrderStatus(tx: Prisma.TransactionClient, salesOrderId: string) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { items: { select: { qty: true, shippedQty: true } } },
  })
  if (!order || order.status === 'CANCELLED') return order
  const status = salesOrderFulfillmentStatus(order.items)
  if (status === order.status) return order
  return tx.salesOrder.update({ where: { id: salesOrderId }, data: { status } })
}
