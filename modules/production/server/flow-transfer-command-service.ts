import type { Prisma } from '@prisma/client'
import { assertInventoryIssueAvailability } from '@/modules/inventory'
import { prisma } from '@/lib/prisma'
import type { FlowTransferInput } from '../contracts/flow-transfer-schema'
import { FlowTransferDomainError, runFlowTransferDomainOperation } from '../domain/flow-transfer-errors'
import { flowTransferNumberPrefix, nextFlowTransferNumber, parseFlowTransferDate } from '../domain/flow-transfer-numbering'
import { flowTransferInclude } from './flow-transfer-query-service'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export async function resolveFlowTransferDraft(tx: Prisma.TransactionClient, input: FlowTransferInput) {
  const [material, sourceLocation, targetLocation, employee] = await Promise.all([
    tx.material.findFirst({
      where: { id: input.materialId, deletedAt: null },
      select: { id: true, code: true, name: true, stockUnit: true, unit: true },
    }),
    tx.inventoryLocation.findFirst({
      where: { id: input.sourceLocationId, isActive: true, deletedAt: null }, select: { id: true, code: true, name: true },
    }),
    tx.inventoryLocation.findFirst({
      where: { id: input.targetLocationId, isActive: true, deletedAt: null }, select: { id: true, code: true, name: true },
    }),
    tx.employee.findFirst({
      where: { id: input.employeeId, isActive: true }, select: { id: true, code: true, name: true, department: true },
    }),
  ])
  if (!material) throw new FlowTransferDomainError('物料不存在或已归档')
  if (!sourceLocation) throw new FlowTransferDomainError('来源库位不存在、已停用或已归档')
  if (!targetLocation) throw new FlowTransferDomainError('目标库位不存在、已停用或已归档')
  if (!employee) throw new FlowTransferDomainError('操作员工不存在或已停用，请重新选择')
  if (sourceLocation.id === targetLocation.id) throw new FlowTransferDomainError('来源库位和目标库位不能相同')
  await assertInventoryIssueAvailability(tx, {
    materialId: material.id, stockQty: input.quantity, locationId: sourceLocation.id,
  })
  return { material, sourceLocation, targetLocation, employee }
}
function transferData(input: FlowTransferInput, resolved: Awaited<ReturnType<typeof resolveFlowTransferDraft>>) {
  return {
    transferDate: parseFlowTransferDate(input.transferDate),
    materialId: resolved.material.id,
    sourceLocationId: input.sourceLocationId,
    targetLocationId: input.targetLocationId,
    quantity: input.quantity,
    unit: resolved.material.stockUnit || resolved.material.unit,
    employeeId: resolved.employee.id,
    employeeCode: resolved.employee.code,
    operator: resolved.employee.name,
    note: input.note?.trim() || null,
  }
}

export async function createManagedFlowTransfer(input: FlowTransferInput, scope: EffectiveDataScope = unrestrictedDataScope) {
  assertInventoryLocationDataScope(scope, [input.sourceLocationId, input.targetLocationId])
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const resolved = await resolveFlowTransferDraft(tx, input)
    const transferDate = parseFlowTransferDate(input.transferDate)
    const prefix = flowTransferNumberPrefix(transferDate)
    const latest = await tx.flowTransfer.findFirst({
      where: { transferNo: { startsWith: prefix } }, orderBy: { transferNo: 'desc' }, select: { transferNo: true },
    })
    return tx.flowTransfer.create({
      data: { transferNo: nextFlowTransferNumber(transferDate, latest?.transferNo), ...transferData(input, resolved) },
      include: flowTransferInclude,
    })
  }))
}

export async function updateManagedFlowTransfer(id: string, input: FlowTransferInput, scope: EffectiveDataScope = unrestrictedDataScope) {
  assertInventoryLocationDataScope(scope, [input.sourceLocationId, input.targetLocationId])
  return runFlowTransferDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.flowTransfer.findUnique({ where: { id }, include: flowTransferInclude })
    if (!current) throw new FlowTransferDomainError('流程转移记录不存在', 404)
    assertInventoryLocationDataScope(scope, [current.sourceLocationId, current.targetLocationId])
    if (current.status !== 'DRAFT') throw new FlowTransferDomainError('只有草稿转移可以修改；已确认转移请先冲销')
    const resolved = await resolveFlowTransferDraft(tx, input)
    const updated = await tx.flowTransfer.update({
      where: { id }, data: transferData(input, resolved), include: flowTransferInclude,
    })
    return { current, updated }
  }))
}
