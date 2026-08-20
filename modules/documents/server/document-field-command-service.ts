import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { DocumentFieldInput, DocumentFieldUpdateInput } from '../contracts/document-field-schema'
import { DocumentFieldError } from '../domain/document-field-errors'
import { normalizeFieldName, normalizeFieldOptions, parseFieldOptions } from '../domain/document-field-rules'
import { normalizeDocumentFieldValue } from '../domain/document-field-rules'
import { documentFieldInclude } from './document-field-query-service'

async function normalizedInput(tx: Prisma.TransactionClient, input: DocumentFieldInput, excludeId?: string) {
  const category = await tx.documentCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } })
  if (!category) throw new DocumentFieldError('文档类别不存在', 404)
  const name = normalizeFieldName(input.name)
  const duplicate = await tx.documentFieldDefinition.findFirst({
    where: { categoryId: input.categoryId, name, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true },
  })
  if (duplicate) throw new DocumentFieldError('该类别已存在同名扩展字段', 409)
  const options = normalizeFieldOptions(input.fieldType, input.options)
  return { categoryId: input.categoryId, name, fieldType: input.fieldType, optionsJson: options.length > 0 ? JSON.stringify(options) : null }
}

export function createDocumentFieldDefinition(input: DocumentFieldInput) {
  return prisma.$transaction(async (tx) => {
    const data = await normalizedInput(tx, input)
    const last = await tx.documentFieldDefinition.findFirst({ where: { categoryId: input.categoryId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    return tx.documentFieldDefinition.create({ data: { ...data, sortOrder: (last?.sortOrder || 0) + 10 }, include: documentFieldInclude })
  })
}

export function updateDocumentFieldDefinition(input: DocumentFieldUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.documentFieldDefinition.findUnique({ where: { id: input.id }, include: documentFieldInclude })
    if (!before) throw new DocumentFieldError('扩展字段不存在', 404)
    if (before.categoryId !== input.categoryId) throw new DocumentFieldError('扩展字段不能移动到其他类别', 409)
    const data = await normalizedInput(tx, input, input.id)
    const nextOptions = data.optionsJson ? parseFieldOptions(data.optionsJson) : []
    const previousOptions = parseFieldOptions(before.optionsJson)
    if (before._count.values > 0 && (before.fieldType !== data.fieldType || JSON.stringify(previousOptions) !== JSON.stringify(nextOptions))) {
      throw new DocumentFieldError('字段已被文档使用，不能修改类型或选项', 409)
    }
    const saved = await tx.documentFieldDefinition.update({ where: { id: input.id }, data, include: documentFieldInclude })
    return { before, saved }
  })
}

export function deleteDocumentFieldDefinition(id: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.documentFieldDefinition.findUnique({ where: { id }, include: documentFieldInclude })
    if (!before) throw new DocumentFieldError('扩展字段不存在', 404)
    if (before._count.values > 0) throw new DocumentFieldError('字段已被文档使用，不能删除', 409)
    await tx.documentFieldDefinition.delete({ where: { id } })
    return before
  })
}

export async function syncWorkInstructionFieldValues(
  tx: Prisma.TransactionClient,
  workInstructionId: string,
  categoryId: string,
  values: Record<string, string>,
) {
  const entries = Object.entries(values)
  if (entries.length === 0) return
  const definitions = await tx.documentFieldDefinition.findMany({
    where: { categoryId, id: { in: entries.map(([id]) => id) } },
    select: { id: true, name: true, fieldType: true, optionsJson: true },
  })
  if (definitions.length !== entries.length) throw new DocumentFieldError('包含不属于当前文档类别的扩展字段', 409)
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))

  for (const [fieldDefinitionId, rawValue] of entries) {
    const definition = definitionById.get(fieldDefinitionId)!
    const valueText = normalizeDocumentFieldValue(definition, rawValue)
    if (!valueText) {
      await tx.workInstructionFieldValue.deleteMany({ where: { workInstructionId, fieldDefinitionId } })
      continue
    }
    await tx.workInstructionFieldValue.upsert({
      where: { workInstructionId_fieldDefinitionId: { workInstructionId, fieldDefinitionId } },
      create: { workInstructionId, fieldDefinitionId, valueText },
      update: { valueText },
    })
  }
}
