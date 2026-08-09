export type DispatchAction = 'dispatch' | 'start' | 'complete' | 'cancel'

const transitionRules: Record<DispatchAction, { allowed: string[]; next: string; error: string }> = {
  dispatch: { allowed: ['PENDING'], next: 'DISPATCHED', error: '只能确认待派工状态的派工单' },
  start: { allowed: ['DISPATCHED'], next: 'IN_PROGRESS', error: '只能开始已派工状态的派工单' },
  complete: { allowed: ['IN_PROGRESS'], next: 'COMPLETED', error: '只能完成进行中的派工单' },
  cancel: { allowed: ['PENDING', 'DISPATCHED'], next: 'CANCELLED', error: '只能取消待派工或已派工状态的派工单' },
}
export function dispatchTransitionError(status: string, action: DispatchAction) {
  const rule = transitionRules[action]
  return rule.allowed.includes(status) ? null : rule.error
}

export function buildDispatchTransition(status: string, action: DispatchAction, now = new Date()) {
  const error = dispatchTransitionError(status, action)
  if (error) return { error, data: null }
  const data: { status: string; dispatchedAt?: Date; startedAt?: Date; completedAt?: Date } = {
    status: transitionRules[action].next,
  }
  if (action === 'dispatch') data.dispatchedAt = now
  if (action === 'start') data.startedAt = now
  if (action === 'complete') data.completedAt = now
  return { error: null, data }
}
