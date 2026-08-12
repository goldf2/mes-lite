import { postInventoryLocationTransfer } from '@/lib/inventory'
import { prisma } from '@/lib/prisma'
import type { ReverseFlowTransferInput } from '../contracts/flow-transfer-schema'
import { FlowTransferDomainError, runFlowTransferDomainOperation } from '../domain/flow-transfer-errors'
import { flowTransferTransitionError } from '../domain/flow-transfer-status'
import { flowTransferInclude } from './flow-transfer-query-service'

export async function confirmManagedFlowTransfer(id: string, confirmedBy: string, now = new Date()) {
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.flowTransfer.findUnique({ where: { id }, include: flowTransferInclude })
    if (!current) throw new FlowTransferDomainError('流程转移记录不存在', 404)
    const statusError = flowTransferTransitionError(current.status, 'confirm')
    if (statusError) throw new FlowTransferDomainError(statusError)
    await postInventoryLocationTransfer(tx, {
      materialId: current.materialId,
      stockQty: Number(current.quantity),
      sourceLocationId: current.sourceLocationId,
      targetLocationId: current.targetLocationId,
      refId: current.id,
      note: `流程转移 ${current.transferNo}`,
      createdBy: confirmedBy,
    })
    const updated = await tx.flowTransfer.update({
      where: { id }, data: { status: 'CONFIRMED', confirmedAt: now, confirmedBy }, include: flowTransferInclude,
    })
    return { current, updated }
  }))
}
export async function reverseManagedFlowTransfer(
  id: string,
  input: ReverseFlowTransferInput,
  reversedBy: string,
  now = new Date(),
) {
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.flowTransfer.findUnique({ where: { id }, include: flowTransferInclude })
    if (!current) throw new FlowTransferDomainError('流程转移记录不存在', 404)
    const statusError = flowTransferTransitionError(current.status, 'reverse')
    if (statusError) throw new FlowTransferDomainError(statusError)
    await postInventoryLocationTransfer(tx, {
      materialId: current.materialId,
      stockQty: Number(current.quantity),
      sourceLocationId: current.targetLocationId,
      targetLocationId: current.sourceLocationId,
      refId: current.id,
      note: `冲销流程转移 ${current.transferNo}：${input.reason}`,
      createdBy: reversedBy,
      reverse: true,
    })
    const updated = await tx.flowTransfer.update({
      where: { id },
      data: { status: 'REVERSED', reversedAt: now, reversedBy, reverseReason: input.reason },
      include: flowTransferInclude,
    })
    return { current, updated }
  }))
}
