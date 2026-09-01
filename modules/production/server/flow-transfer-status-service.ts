import { postInventoryLocationTransfer } from '@/modules/inventory'
import { transferAvailableInventoryLots } from '@/modules/inventory'
import { prisma } from '@/lib/prisma'
import type { ReverseFlowTransferInput } from '../contracts/flow-transfer-schema'
import { FlowTransferDomainError, runFlowTransferDomainOperation } from '../domain/flow-transfer-errors'
import { flowTransferTransitionError } from '../domain/flow-transfer-status'
import { flowTransferInclude } from './flow-transfer-query-service'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export async function confirmManagedFlowTransfer(id: string, confirmedBy: string, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.flowTransfer.findUnique({ where: { id }, include: flowTransferInclude })
    if (!current) throw new FlowTransferDomainError('流程转移记录不存在', 404)
    assertInventoryLocationDataScope(scope, [current.sourceLocationId, current.targetLocationId])
    const statusError = flowTransferTransitionError(current.status, 'confirm')
    if (statusError) throw new FlowTransferDomainError(statusError)
    const moved = await postInventoryLocationTransfer(tx, {
      materialId: current.materialId,
      stockQty: Number(current.quantity),
      sourceLocationId: current.sourceLocationId,
      targetLocationId: current.targetLocationId,
      refId: current.id,
      note: `流程转移 ${current.transferNo}`,
      createdBy: confirmedBy,
    })
    await transferAvailableInventoryLots(tx, {
      materialId: current.materialId,
      materialCode: moved.material.code,
      sourceLocationId: current.sourceLocationId,
      sourceLocationCode: moved.sourceLocation.code,
      targetLocationId: current.targetLocationId,
      stockQty: Number(current.quantity),
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
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.flowTransfer.findUnique({ where: { id }, include: flowTransferInclude })
    if (!current) throw new FlowTransferDomainError('流程转移记录不存在', 404)
    assertInventoryLocationDataScope(scope, [current.sourceLocationId, current.targetLocationId])
    const statusError = flowTransferTransitionError(current.status, 'reverse')
    if (statusError) throw new FlowTransferDomainError(statusError)
    const moved = await postInventoryLocationTransfer(tx, {
      materialId: current.materialId,
      stockQty: Number(current.quantity),
      sourceLocationId: current.targetLocationId,
      targetLocationId: current.sourceLocationId,
      refId: current.id,
      note: `冲销流程转移 ${current.transferNo}：${input.reason}`,
      createdBy: reversedBy,
      reverse: true,
    })
    await transferAvailableInventoryLots(tx, {
      materialId: current.materialId,
      materialCode: moved.material.code,
      sourceLocationId: current.targetLocationId,
      sourceLocationCode: moved.sourceLocation.code,
      targetLocationId: current.sourceLocationId,
      stockQty: Number(current.quantity),
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
