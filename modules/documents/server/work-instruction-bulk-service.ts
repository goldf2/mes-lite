import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { WorkInstructionBulkUpdateInput } from '../contracts/work-instruction-schema'
import { syncWorkInstructionFieldValues } from './document-field-command-service'
import { WorkInstructionValidationError } from './work-instruction-command-service'

const bulkInstructionInclude = {
  material: { select: { id: true, code: true, name: true } },
  fieldValues: true,
} satisfies Prisma.WorkInstructionInclude

export async function bulkUpdateWorkInstructions(input: WorkInstructionBulkUpdateInput) {
  const ids = Array.from(new Set(input.ids))
  return prisma.$transaction(async (tx) => {
    const before = await tx.workInstruction.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: bulkInstructionInclude,
    })
    if (before.length !== ids.length) throw new WorkInstructionValidationError('选中文档中包含不存在或已归档记录')
    const categoryIds = Array.from(new Set(before.map((instruction) => instruction.categoryId)))
    if (categoryIds.length !== 1) throw new WorkInstructionValidationError('批量修改只能应用于同一类别的文档')

    const { updates } = input
    if ('materialId' in updates && updates.materialId) {
      const material = await tx.material.findFirst({
        where: { id: updates.materialId, category: 'FINISHED', deletedAt: null }, select: { id: true },
      })
      if (!material) throw new WorkInstructionValidationError('关联产品不存在或已归档')
    }
    const updated = []
    for (const instruction of before) {
      const data: Prisma.WorkInstructionUpdateInput = { updatedAt: new Date() }
      if (updates.version !== undefined) data.version = updates.version
      if (updates.status !== undefined) data.status = updates.status
      if ('materialId' in updates) data.material = updates.materialId ? { connect: { id: updates.materialId } } : { disconnect: true }
      if ('note' in updates) data.note = updates.note || null
      await tx.workInstruction.update({ where: { id: instruction.id }, data })
      if (updates.fieldValues) {
        await syncWorkInstructionFieldValues(tx, instruction.id, categoryIds[0], updates.fieldValues)
      }
      updated.push(await tx.workInstruction.findUniqueOrThrow({ where: { id: instruction.id }, include: bulkInstructionInclude }))
    }
    return { categoryId: categoryIds[0], before, updated }
  })
}
