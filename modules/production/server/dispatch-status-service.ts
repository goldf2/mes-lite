import { prisma } from '@/lib/prisma'
import { DispatchDomainError } from '../domain/dispatch-errors'
import { buildDispatchTransition, type DispatchAction } from '../domain/dispatch-status'

export async function transitionManagedDispatch(id: string, action: DispatchAction, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.dispatch.findUnique({ where: { id } })
    if (!current || current.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
    const transition = buildDispatchTransition(current.status, action, now)
    if (transition.error || !transition.data) throw new DispatchDomainError(transition.error ?? '派工状态流转失败')
    const updated = await tx.dispatch.update({ where: { id }, data: transition.data })
    return { current, updated }
  })
}
