import type { Prisma } from '@prisma/client'
import { ProductionOrderDomainError } from '../domain/production-order-errors'

const productionEquipmentStatuses = ['AVAILABLE', 'IN_USE'] as const

type ContextDatabase = Pick<Prisma.TransactionClient, 'documentAttachment' | 'equipment' | 'workInstruction'>

export interface ProductionOrderContextSource {
  materialId?: string | null
  dispatches?: Array<{ step?: { workCenterId?: string | null } | null }>
  product?: {
    processRoutes?: Array<{ steps?: Array<{ workCenterId?: string | null }> }>
  } | null
}

export interface ProductionActualContextSelection {
  equipmentIds?: string[]
  equipmentExceptionReason?: string
  workInstructionIds?: string[]
  workInstructionExceptionReason?: string
}

export function productionOrderContextWorkCenterIds(order: ProductionOrderContextSource) {
  const ids = [
    ...(order.dispatches || []).map((dispatch) => dispatch.step?.workCenterId),
    ...(order.product?.processRoutes || []).flatMap((route) => (route.steps || []).map((step) => step.workCenterId)),
  ].filter((id): id is string => Boolean(id))
  return Array.from(new Set(ids)).sort()
}

function workInstructionWhere(order: ProductionOrderContextSource): Prisma.WorkInstructionWhereInput {
  return {
    deletedAt: null,
    status: 'ACTIVE',
    ...(order.materialId ? { OR: [{ materialId: order.materialId }, { materialId: null }] } : {}),
  }
}

const attachmentSelect = {
  id: true,
  originalName: true,
  documentType: true,
  mimeType: true,
  size: true,
  note: true,
  createdAt: true,
} as const

async function attachmentsByInstruction(db: ContextDatabase, instructionIds: string[]) {
  if (instructionIds.length === 0) return new Map<string, Array<{
    id: string
    originalName: string
    documentType: string
    mimeType: string
    size: number
    note: string | null
    createdAt: Date
  }>>()
  const attachments = await db.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', ownerId: { in: instructionIds }, deletedAt: null },
    select: { ownerId: true, ...attachmentSelect },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const result = new Map<string, Omit<(typeof attachments)[number], 'ownerId'>[]>()
  for (const { ownerId, ...attachment } of attachments) {
    result.set(ownerId, [...(result.get(ownerId) || []), attachment])
  }
  return result
}

export async function loadProductionActualExecutionContext(db: ContextDatabase, order: ProductionOrderContextSource) {
  const workCenterIds = productionOrderContextWorkCenterIds(order)
  const [equipment, instructions] = await Promise.all([
    workCenterIds.length === 0 ? [] : db.equipment.findMany({
      where: {
        deletedAt: null,
        status: { in: [...productionEquipmentStatuses] },
        workCenterId: { in: workCenterIds },
        workCenter: { is: { isActive: true, deletedAt: null } },
      },
      select: {
        id: true, code: true, name: true, equipmentType: true, model: true, status: true,
        workCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ workCenter: { code: 'asc' } }, { code: 'asc' }],
    }),
    db.workInstruction.findMany({
      where: workInstructionWhere(order),
      select: {
        id: true, title: true, version: true, status: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ title: 'asc' }, { version: 'asc' }],
    }),
  ])
  const attachments = await attachmentsByInstruction(db, instructions.map((item) => item.id))
  return {
    workCenterIds,
    equipment,
    workInstructions: instructions.map((instruction) => ({
      ...instruction,
      attachments: attachments.get(instruction.id) || [],
    })),
  }
}

function normalizedReason(value: string | undefined, label: string) {
  const reason = value?.trim() || null
  if (reason && (reason.length < 2 || reason.length > 200)) {
    throw new ProductionOrderDomainError(`${label}必须填写 2 至 200 个字符`)
  }
  return reason
}

function uniqueIds(ids: string[] | undefined, label: string) {
  const values = ids || []
  if (values.length > 20) throw new ProductionOrderDomainError(`${label}最多选择 20 项`)
  if (new Set(values).size !== values.length) throw new ProductionOrderDomainError(`${label}不能重复选择`)
  return values
}

export async function resolveProductionActualExecutionContext(
  db: ContextDatabase,
  order: ProductionOrderContextSource,
  input: ProductionActualContextSelection,
) {
  const equipmentIds = uniqueIds(input.equipmentIds, '实际设备')
  const workInstructionIds = uniqueIds(input.workInstructionIds, '作业文件')
  const equipmentExceptionReason = normalizedReason(input.equipmentExceptionReason, '设备例外原因')
  const workInstructionExceptionReason = normalizedReason(input.workInstructionExceptionReason, '作业文件例外原因')
  if (equipmentIds.length === 0 && !equipmentExceptionReason) {
    throw new ProductionOrderDomainError('必须选择实际设备或填写设备例外原因')
  }
  if (workInstructionIds.length === 0 && !workInstructionExceptionReason) {
    throw new ProductionOrderDomainError('必须选择作业文件或填写作业文件例外原因')
  }

  const workCenterIds = productionOrderContextWorkCenterIds(order)
  const [equipment, instructions] = await Promise.all([
    equipmentIds.length === 0 ? [] : db.equipment.findMany({
      where: {
        id: { in: equipmentIds },
        deletedAt: null,
        status: { in: [...productionEquipmentStatuses] },
        workCenterId: { in: workCenterIds },
        workCenter: { is: { isActive: true, deletedAt: null } },
      },
      select: {
        id: true, code: true, name: true, equipmentType: true, model: true, status: true,
        workCenter: { select: { id: true, code: true, name: true } },
      },
    }),
    workInstructionIds.length === 0 ? [] : db.workInstruction.findMany({
      where: { id: { in: workInstructionIds }, ...workInstructionWhere(order) },
      select: {
        id: true, title: true, version: true, status: true, contentJson: true, contentText: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
      },
    }),
  ])
  if (equipment.length !== equipmentIds.length) {
    throw new ProductionOrderDomainError('所选设备不可用于当前生产订单；请检查工作中心、归档状态或设备状态')
  }
  if (instructions.length !== workInstructionIds.length) {
    throw new ProductionOrderDomainError('所选作业文件不可用于当前生产订单；请检查关联产品、归档状态或生效状态')
  }
  const attachments = await attachmentsByInstruction(db, instructions.map((item) => item.id))
  const equipmentById = new Map(equipment.map((item) => [item.id, item]))
  const instructionById = new Map(instructions.map((item) => [item.id, item]))

  return {
    equipmentExceptionReason,
    workInstructionExceptionReason,
    equipmentSnapshots: equipmentIds.map((id) => {
      const item = equipmentById.get(id)!
      return {
        sourceEquipmentId: item.id,
        equipmentCode: item.code,
        equipmentName: item.name,
        equipmentType: item.equipmentType,
        equipmentModel: item.model,
        equipmentStatus: item.status,
        workCenterId: item.workCenter.id,
        workCenterCode: item.workCenter.code,
        workCenterName: item.workCenter.name,
      }
    }),
    workInstructionSnapshots: workInstructionIds.map((id) => {
      const item = instructionById.get(id)!
      return {
        sourceWorkInstructionId: item.id,
        title: item.title,
        version: item.version,
        status: item.status,
        categoryId: item.category.id,
        categoryName: item.category.name,
        materialId: item.material?.id || null,
        materialCode: item.material?.code || null,
        materialName: item.material?.name || null,
        workCentersJson: '[]',
        contentJson: item.contentJson,
        contentText: item.contentText,
        attachmentsJson: JSON.stringify(attachments.get(item.id) || []),
        sourceUpdatedAt: item.updatedAt,
      }
    }),
  }
}

export function assertProductionActualExecutionContext(actual: {
  equipmentExceptionReason?: string | null
  workInstructionExceptionReason?: string | null
  equipmentSnapshots?: Array<{ id: string }>
  workInstructionSnapshots?: Array<{ id: string }>
}) {
  if ((actual.equipmentSnapshots?.length || 0) === 0 && (actual.equipmentExceptionReason?.trim().length || 0) < 2) {
    throw new ProductionOrderDomainError('必须选择实际设备或填写设备例外原因')
  }
  if ((actual.workInstructionSnapshots?.length || 0) === 0 && (actual.workInstructionExceptionReason?.trim().length || 0) < 2) {
    throw new ProductionOrderDomainError('必须选择作业文件或填写作业文件例外原因')
  }
}
