import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  DocumentCategoryFieldsInput,
  DocumentCategoryUpdateInput,
} from '../contracts/document-category-schema'
import { DocumentCategoryError } from '../domain/document-category-errors'
import { normalizeDocumentCategoryName } from '../domain/document-category-rules'
import { documentCategoryInclude } from './document-category-query-service'

async function validateParent(
  tx: Prisma.TransactionClient,
  categoryId: string | null,
  parentId: string | null,
) {
  if (!parentId) return
  if (categoryId === parentId) throw new DocumentCategoryError('类别不能以自身作为上级')
  const parent = await tx.documentCategory.findUnique({
    where: { id: parentId }, select: { parentId: true },
  })
  if (!parent) throw new DocumentCategoryError('上级类别不存在')
  if (parent.parentId) throw new DocumentCategoryError('产品文档类别最多支持两级')
}

async function validateDuplicate(
  tx: Prisma.TransactionClient,
  name: string,
  parentId: string | null,
  excludeId?: string,
) {
  const duplicate = await tx.documentCategory.findFirst({
    where: { name, parentId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  })
  if (duplicate) throw new DocumentCategoryError('同一层级已存在同名类别', 409)
}

export function createManagedDocumentCategory(input: DocumentCategoryFieldsInput) {
  return prisma.$transaction(async (tx) => {
    const name = normalizeDocumentCategoryName(input.name)
    const parentId = input.parentId || null
    await validateParent(tx, null, parentId)
    await validateDuplicate(tx, name, parentId)
    const lastCategory = await tx.documentCategory.findFirst({
      where: { parentId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    })
    return tx.documentCategory.create({
      data: { name, parentId, sortOrder: (lastCategory?.sortOrder || 0) + 10 },
      include: documentCategoryInclude,
    })
  })
}

export function updateManagedDocumentCategory(input: DocumentCategoryUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.documentCategory.findUnique({
      where: { id: input.id }, include: { _count: { select: { children: true } } },
    })
    if (!current) throw new DocumentCategoryError('文档类别不存在', 404)
    const name = normalizeDocumentCategoryName(input.name)
    const parentId = input.parentId || null
    await validateParent(tx, current.id, parentId)
    if (parentId && current._count.children > 0) {
      throw new DocumentCategoryError('含有二级类别的一级类别不能改为二级类别', 409)
    }
    await validateDuplicate(tx, name, parentId, current.id)
    const saved = await tx.documentCategory.update({
      where: { id: current.id }, data: { name, parentId }, include: documentCategoryInclude,
    })
    return { before: current, saved }
  })
}

export function deleteManagedDocumentCategory(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.documentCategory.findUnique({
      where: { id }, include: { _count: { select: { children: true, workInstructions: true } } },
    })
    if (!current) throw new DocumentCategoryError('文档类别不存在', 404)
    if (current._count.children > 0) {
      throw new DocumentCategoryError('请先删除该类别下的二级类别', 409)
    }
    if (current._count.workInstructions > 0) {
      throw new DocumentCategoryError('该类别仍有产品文档引用，不能删除', 409)
    }
    await tx.documentCategory.delete({ where: { id } })
    return current
  })
}
