import { prisma } from '@/lib/prisma'
import type { CreateDispatchInput } from '../contracts/dispatch-schema'
import { DispatchDomainError } from '../domain/dispatch-errors'
import { dispatchNumberPrefix, nextDispatchNumber } from '../domain/dispatch-numbering'
import { productionOrderDispatchError } from '../domain/production-order-status'
import { dispatchDetailInclude } from './dispatch-query-service'

export async function createManagedDispatch(input: CreateDispatchInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: input.orderId },
      include: { product: { include: { processRoutes: { include: { steps: true } } } }, targetMaterial: true },
    })
    if (!order || order.deletedAt) throw new DispatchDomainError('工单不存在或已归档', 404)
    const dispatchError = productionOrderDispatchError(order.status, order.materialId)
    if (dispatchError) throw new DispatchDomainError(dispatchError)
    const stepIds = order.product.processRoutes.flatMap((route) => route.steps.map((step) => step.id))
    if (!stepIds.includes(input.stepId)) throw new DispatchDomainError('工序不属于该工单物料的工艺路线')

    const prefix = dispatchNumberPrefix(now)
    const latest = await tx.dispatch.findFirst({
      where: { dispatchNo: { startsWith: prefix } }, orderBy: { dispatchNo: 'desc' }, select: { dispatchNo: true },
    })
    return tx.dispatch.create({
      data: {
        dispatchNo: nextDispatchNumber(now, latest?.dispatchNo),
        voucherNo: input.voucherNo?.trim() || null,
        orderId: input.orderId,
        stepId: input.stepId,
        workerName: input.workerName.trim(),
        workerId: input.workerId?.trim() || null,
        planQty: input.planQty,
        priority: input.priority ?? 'NORMAL',
        status: 'PENDING',
        note: input.note?.trim() || null,
      },
      include: dispatchDetailInclude,
    })
  })
}
export async function archiveManagedDispatch(id: string) {
  const current = await prisma.dispatch.findUnique({ where: { id } })
  if (!current || current.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
  const updated = await prisma.dispatch.update({ where: { id }, data: { deletedAt: new Date() } })
  return { current, updated }
}
