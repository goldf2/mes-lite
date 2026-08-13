import { prisma } from '@/lib/prisma'
import { DispatchDomainError } from '../domain/dispatch-errors'
import { buildDispatchTransition, type DispatchAction } from '../domain/dispatch-status'
import { assertDispatchDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export async function transitionManagedDispatch(id: string, action: DispatchAction, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.dispatch.findUnique({ where: { id }, include: { step: { select: { workCenterId: true } } } })
    if (!current || current.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
    assertDispatchDataScope(scope, current)
    const transition = buildDispatchTransition(current.status, action, now)
    if (transition.error || !transition.data) throw new DispatchDomainError(transition.error ?? '派工状态流转失败')
    const updated = await tx.dispatch.update({ where: { id }, data: transition.data })
    return { current, updated }
  })
}
