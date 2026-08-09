import type { getAuditContext } from '@/lib/audit'
import { createAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import type { CreateSalesOrderCommand, UpdateSalesOrderPriceCommand } from '../contracts/sales-order-schema'
import { datedDocumentPrefix, nextDatedDocumentNo, parseSalesDate } from '../domain/sales-document-numbering'
import { SalesDomainError } from '../domain/sales-errors'
import { normalizeSalesOrderPricing } from '../domain/sales-order-pricing'

export async function createManagedSalesOrder(input: CreateSalesOrderCommand, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const materialIds = input.items.map((item) => item.materialId)
    const [customer, materials, latest] = await Promise.all([
      tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null } }),
      tx.material.findMany({ where: { id: { in: materialIds }, deletedAt: null } }),
      tx.salesOrder.findFirst({
        where: { orderNo: { startsWith: datedDocumentPrefix('SO', now) } },
        orderBy: { orderNo: 'desc' },
        select: { orderNo: true },
      }),
    ])
    if (!customer) throw new SalesDomainError('客户不存在或已归档')
    const pricing = normalizeSalesOrderPricing(input.items, materials)
    return tx.salesOrder.create({
      data: {
        orderNo: nextDatedDocumentNo('SO', now, latest?.orderNo),
        voucherNo: input.voucherNo?.trim() || null,
        customerId: customer.id,
        orderDate: parseSalesDate(input.orderDate, '订单日期'),
        deliveryDate: input.deliveryDate ? parseSalesDate(input.deliveryDate, '交付日期') : null,
        totalAmount: pricing.totalAmount,
        currency: pricing.currency,
        note: input.note?.trim() || null,
        items: { create: pricing.items },
      },
      include: { customer: true, items: { include: { material: true } } },
    })
  })
}

export async function confirmManagedSalesOrder(id: string) {
  const before = await prisma.salesOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } })
  if (!before) throw new SalesDomainError('销售订单不存在', 404)
  if (before.status !== 'DRAFT') throw new SalesDomainError('只能确认草稿状态的销售订单')
  if (before.items.length === 0) throw new SalesDomainError('销售订单没有明细')
  const updated = await prisma.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED' } })
  return { before, updated }
}

export async function cancelManagedSalesOrder(id: string) {
  const before = await prisma.salesOrder.findFirst({
    where: { id, deletedAt: null },
    include: { shipments: { where: { status: { not: 'CANCELLED' }, deletedAt: null }, select: { id: true } } },
  })
  if (!before) throw new SalesDomainError('销售订单不存在', 404)
  if (!['DRAFT', 'CONFIRMED'].includes(before.status)) throw new SalesDomainError('当前状态不能取消销售订单')
  if (before.shipments.length > 0) throw new SalesDomainError('订单已有发货单，请先取消待发货单')
  const updated = await prisma.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
  return { before, updated }
}

export async function updateManagedSalesOrderPrices(
  id: string,
  input: UpdateSalesOrderPriceCommand,
  auditContext: Awaited<ReturnType<typeof getAuditContext>>,
) {
  const order = await prisma.salesOrder.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: { createdAt: 'asc' }, include: { shipments: { where: { deletedAt: null }, select: { id: true } } } } },
  })
  if (!order) throw new SalesDomainError('销售订单不存在或已归档', 404)
  if (!['DRAFT', 'CONFIRMED'].includes(order.status)) throw new SalesDomainError('只有草稿或尚未执行的已确认订单可以调整价格')
  if (order.items.some((item) => item.shipments.length > 0)) throw new SalesDomainError('订单已经产生发货记录，价格已锁定')
  if (order.status !== 'DRAFT' && !input.reason) throw new SalesDomainError('已确认订单调价必须填写原因')
  const inputById = new Map(input.items.map((item) => [item.id, item.unitPrice]))
  if (inputById.size !== order.items.length || order.items.some((item) => !inputById.has(item.id))) {
    throw new SalesDomainError('销售明细与当前订单不一致，请刷新后重试')
  }
  return prisma.$transaction(async (tx) => {
    const changedAt = new Date()
    await Promise.all(order.items.map((item) => {
      const unitPrice = inputById.get(item.id)!
      return tx.salesOrderItem.update({
        where: { id: item.id },
        data: {
          unitPrice, totalAmount: Number(item.qty) * unitPrice, priceSource: 'MANUAL',
          priceAdjustedAt: changedAt,
          priceAdjustedBy: auditContext.operatorName || auditContext.operatorId || null,
          priceAdjustReason: input.reason || null,
        },
      })
    }))
    const totalAmount = order.items.reduce((sum, item) => sum + Number(item.qty) * inputById.get(item.id)!, 0)
    const updated = await tx.salesOrder.update({
      where: { id: order.id }, data: { totalAmount },
      include: { customer: true, items: { include: { material: true } } },
    })
    await createAuditLog(tx, auditContext, {
      action: 'ADJUST_PRICE', entityType: 'SALES_ORDER', entityId: order.id, entityLabel: order.orderNo,
      beforeData: order.items.map((item) => ({ id: item.id, unitPrice: item.unitPrice, totalAmount: item.totalAmount })),
      afterData: updated.items.map((item) => ({ id: item.id, unitPrice: item.unitPrice, totalAmount: item.totalAmount })),
      note: input.reason || '草稿价格调整',
    })
    return updated
  })
}
