import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { ShipmentPricesCommand } from '../contracts/fulfillment-schema'
import { SalesDomainError } from '../domain/sales-errors'

export async function updateShipmentPrices(id: string, input: ShipmentPricesCommand, scope: EffectiveDataScope, audit: AuditContext) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.shipment.findFirst({ where: { id, deletedAt: null }, include: { items: true } })
    if (!current) throw new SalesDomainError('发货单不存在或已归档', 404)
    assertInventoryLocationDataScope(scope, current.items.map((item) => item.locationId))
    if (!['PENDING', 'SHIPPED', 'DELIVERED'].includes(current.status)) throw new SalesDomainError('已取消或冲销的发货单不能改价')
    const prices = new Map(input.items.map((item) => [item.id, item.unitPrice]))
    if (prices.size !== input.items.length || prices.size !== current.items.length || current.items.some((item) => !prices.has(item.id))) throw new SalesDomainError('发货明细不匹配，请刷新后重试')
    const lines = current.items.map((item) => ({ id: item.id, unitPrice: prices.get(item.id)!, totalAmount: Number((item.qty * prices.get(item.id)!).toFixed(2)) }))
    const totalAmount = Number(lines.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2))
    if (!Number.isFinite(totalAmount)) throw new SalesDomainError('发货金额超出有效范围')
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const changed = await tx.shipment.updateMany({ where: { id, updatedAt: new Date(input.updatedAt) }, data: { totalAmount, unitPrice: lines.length === 1 ? lines[0].unitPrice : 0, updatedAt } })
    if (changed.count !== 1) throw new SalesDomainError('发货单已发生变化，请刷新后再修改价格', 409)
    for (const line of lines) await tx.shipmentItem.update({ where: { id: line.id }, data: { unitPrice: line.unitPrice, totalAmount: line.totalAmount } })
    await createAuditLog(tx, audit, {
      action: 'UPDATE', entityType: 'SHIPMENT', entityId: id, entityLabel: current.shipmentNo,
      beforeData: { totalAmount: current.totalAmount, items: current.items.map(({ id, unitPrice, totalAmount }) => ({ id, unitPrice, totalAmount })) },
      afterData: { reason: input.reason, totalAmount, items: lines },
    })
    return { id, totalAmount, updatedAt }
  })
}
