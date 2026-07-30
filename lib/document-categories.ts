import { Prisma, PrismaClient } from '@prisma/client'

type CategoryClient = PrismaClient | Prisma.TransactionClient

export class DocumentCategoryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

const categoryInclude = {
  parent: { select: { id: true, name: true } },
  _count: { select: { children: true, workInstructions: true } },
} as const

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

async function validateParent(client: CategoryClient, categoryId: string | null, parentId: string | null) {
  if (!parentId) return
  if (categoryId === parentId) throw new DocumentCategoryError('类别不能以自身作为上级', 400)

  const parent = await client.documentCategory.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  })
  if (!parent) throw new DocumentCategoryError('上级类别不存在', 400)
  if (parent.parentId) throw new DocumentCategoryError('产品文档类别最多支持两级', 400)
}

async function validateDuplicate(
  client: CategoryClient,
  name: string,
  parentId: string | null,
  excludeId?: string,
) {
  const duplicate = await client.documentCategory.findFirst({
    where: {
      name,
      parentId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (duplicate) throw new DocumentCategoryError('同一层级已存在同名类别', 409)
}

export async function listDocumentCategories(client: CategoryClient) {
  return client.documentCategory.findMany({
    include: categoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function createDocumentCategory(
  client: CategoryClient,
  input: { name: string; parentId?: string | null },
) {
  const name = normalizeName(input.name)
  if (!name) throw new DocumentCategoryError('类别名称不能为空', 400)
  const parentId = input.parentId || null
  await validateParent(client, null, parentId)
  await validateDuplicate(client, name, parentId)

  const lastCategory = await client.documentCategory.findFirst({
    where: { parentId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  return client.documentCategory.create({
    data: {
      name,
      parentId,
      sortOrder: (lastCategory?.sortOrder || 0) + 10,
    },
    include: categoryInclude,
  })
}

export async function updateDocumentCategory(
  client: CategoryClient,
  input: { id: string; name: string; parentId?: string | null },
) {
  const current = await client.documentCategory.findUnique({
    where: { id: input.id },
    include: { _count: { select: { children: true } } },
  })
  if (!current) throw new DocumentCategoryError('文档类别不存在', 404)

  const name = normalizeName(input.name)
  if (!name) throw new DocumentCategoryError('类别名称不能为空', 400)
  const parentId = input.parentId || null
  await validateParent(client, current.id, parentId)
  if (parentId && current._count.children > 0) {
    throw new DocumentCategoryError('含有二级类别的一级类别不能改为二级类别', 409)
  }
  await validateDuplicate(client, name, parentId, current.id)

  return client.documentCategory.update({
    where: { id: current.id },
    data: { name, parentId },
    include: categoryInclude,
  })
}

export async function deleteDocumentCategory(client: CategoryClient, id: string) {
  const current = await client.documentCategory.findUnique({
    where: { id },
    include: {
      _count: { select: { children: true, workInstructions: true } },
    },
  })
  if (!current) throw new DocumentCategoryError('文档类别不存在', 404)
  if (current._count.children > 0) {
    throw new DocumentCategoryError('请先删除该类别下的二级类别', 409)
  }
  if (current._count.workInstructions > 0) {
    throw new DocumentCategoryError('该类别仍有产品文档引用，不能删除', 409)
  }

  return client.documentCategory.delete({ where: { id } })
}
