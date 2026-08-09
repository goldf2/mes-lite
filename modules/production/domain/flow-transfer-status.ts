export type FlowTransferAction = 'confirm' | 'reverse'

export function flowTransferTransitionError(status: string, action: FlowTransferAction) {
  if (action === 'confirm') return status === 'DRAFT' ? null : '只有草稿转移可以确认'
  return status === 'CONFIRMED' ? null : '只有已确认转移可以冲销'
}
