import type { Prisma } from '@prisma/client'
import { DocumentContentValidationError, normalizeDocumentContent } from '@/lib/document-content'
import { prisma } from '@/lib/prisma'
import type { WorkInstructionInput, WorkInstructionUpdateInput } from '../contracts/work-instruction-schema'
import { syncWorkInstructionFieldValues } from './document-field-command-service'

const instructionInclude = {
  category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
  material: { select: { id: true, code: true, name: true, spec: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
  fieldValues: {
    include: { fieldDefinition: { select: { id: true, name: true, fieldType: true, optionsJson: true, sortOrder: true } } },
    orderBy: { fieldDefinition: { sortOrder: 'asc' } },
  },
} satisfies Prisma.WorkInstructionInclude

export { DocumentContentValidationError }

export class WorkInstructionValidationError extends Error {}
export class WorkInstructionNotFoundError extends Error {
  constructor() { super('产品文档不存在或已归档') }
}

export function createAutomaticWorkInstructionTitle(
  material: { code: string; name: string } | null,
  category: { name: string },
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  const timestamp = `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`
  return `${material ? `${material.code} ${material.name}` : '通用'} · ${category.name} · ${timestamp}`.slice(0, 200)
}

async function validateRelations(tx: Prisma.TransactionClient, data: WorkInstructionInput) {
  const materialId = data.materialId || null
  const [material, category] = await Promise.all([
    materialId ? tx.material.findFirst({ where: { id: materialId, category: 'FINISHED', deletedAt: null }, select: { id: true, code: true, name: true } }) : null,
    tx.documentCategory.findUnique({ where: { id: data.categoryId }, select: { id: true, name: true } }),
  ])
  if (materialId && !material) throw new WorkInstructionValidationError('关联产品不存在或已归档')
  if (!category) throw new WorkInstructionValidationError('文档类别不存在')
  return { material, category }
}

function instructionData(data: WorkInstructionInput, relations: Awaited<ReturnType<typeof validateRelations>>, now?: Date) {
  return {
    categoryId: relations.category.id,
    title: data.title || createAutomaticWorkInstructionTitle(relations.material, relations.category, now),
    version: data.version || 'v1',
    status: data.status || 'ACTIVE',
    materialId: relations.material?.id || null,
    content: normalizeDocumentContent(data.contentJson),
    note: data.note || null,
  }
}

export async function createWorkInstruction(data: WorkInstructionInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const relations = await validateRelations(tx, data)
    const normalized = instructionData(data, relations, now)
    const instruction = await tx.workInstruction.create({
      data: {
        categoryId: normalized.categoryId, title: normalized.title, version: normalized.version,
        status: normalized.status, materialId: normalized.materialId,
        ...normalized.content, note: normalized.note,
      },
      include: instructionInclude,
    })
    await syncWorkInstructionFieldValues(tx, instruction.id, normalized.categoryId, data.fieldValues)
    return tx.workInstruction.findUniqueOrThrow({ where: { id: instruction.id }, include: instructionInclude })
  })
}

export async function updateWorkInstruction(data: WorkInstructionUpdateInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.workInstruction.findUnique({ where: { id: data.id }, include: { fieldValues: true } })
    if (!before || before.deletedAt) throw new WorkInstructionNotFoundError()
    const relations = await validateRelations(tx, data)
    const normalized = instructionData(data, relations, now)
    await tx.workInstruction.update({
      where: { id: data.id },
      data: {
        categoryId: normalized.categoryId, title: normalized.title, version: normalized.version,
        status: normalized.status, materialId: normalized.materialId,
        ...normalized.content, note: normalized.note,
      },
      include: instructionInclude,
    })
    if (before.categoryId !== normalized.categoryId) {
      await tx.workInstructionFieldValue.deleteMany({ where: { workInstructionId: data.id } })
    }
    await syncWorkInstructionFieldValues(tx, data.id, normalized.categoryId, data.fieldValues)
    const instruction = await tx.workInstruction.findUniqueOrThrow({ where: { id: data.id }, include: instructionInclude })
    return { before, instruction }
  })
}

export async function archiveWorkInstruction(id: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.workInstruction.findUnique({ where: { id }, include: { material: { select: { code: true, name: true } } } })
    if (!before || before.deletedAt) throw new WorkInstructionNotFoundError()
    const instruction = await tx.workInstruction.update({ where: { id }, data: { deletedAt: new Date() } })
    return { before, instruction }
  })
}
