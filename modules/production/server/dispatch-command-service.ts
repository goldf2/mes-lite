import { prisma } from '@/lib/prisma'
import type { CreateDispatchInput } from '../contracts/dispatch-schema'
import { DispatchDomainError } from '../domain/dispatch-errors'
import { dispatchNumberPrefix, nextDispatchNumber } from '../domain/dispatch-numbering'
import { productionOrderDispatchError } from '../domain/production-order-status'
import { dispatchDetailInclude } from './dispatch-query-service'
import { assertDispatchDataScope, assertProductionAssignmentDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export async function createManagedDispatch(input: CreateDispatchInput, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: input.orderId },
      include: { product: { include: { processRoutes: { include: { steps: { include: { workCenter: true } } } } } }, targetMaterial: true },
    })
    if (!order || order.deletedAt) throw new DispatchDomainError('工单不存在或已归档', 404)
    const dispatchError = productionOrderDispatchError(order.status, order.materialId)
    if (dispatchError) throw new DispatchDomainError(dispatchError)
    const steps = order.product.processRoutes.flatMap((route) => route.steps)
    const step = steps.find((candidate) => candidate.id === input.stepId)
    if (!step) throw new DispatchDomainError('工序不属于该工单物料的工艺路线')
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, isActive: true }, select: { id: true, code: true, name: true },
    })
    if (!employee) throw new DispatchDomainError('生产员工不存在或已停用')
    assertProductionAssignmentDataScope(scope, { employeeId: employee.id, workCenterId: step.workCenterId })

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
        employeeId: employee.id,
        workerName: employee.name,
        workerId: employee.code,
        planQty: input.planQty,
        priority: input.priority ?? 'NORMAL',
        status: 'PENDING',
        note: input.note?.trim() || null,
      },
      include: dispatchDetailInclude,
    })
  })
}
export async function archiveManagedDispatch(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const current = await prisma.dispatch.findUnique({ where: { id }, include: { step: { select: { workCenterId: true } } } })
  if (!current || current.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
  assertDispatchDataScope(scope, current)
  const updated = await prisma.dispatch.update({ where: { id }, data: { deletedAt: new Date() } })
  return { current, updated }
}
