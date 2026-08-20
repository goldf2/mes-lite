import type { Prisma } from '@prisma/client'
import { withAttachmentUrls } from '@/lib/attachment-urls'
import { officeAttachmentMimeTypes } from '@/lib/attachment-file-types'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import type { WorkInstructionAdvancedCondition, WorkInstructionListQuery } from '../contracts/work-instruction-schema'

function stringCondition(condition: WorkInstructionAdvancedCondition) {
  if (condition.operator === 'equals') return { equals: condition.value }
  if (condition.operator === 'startsWith') return { startsWith: condition.value }
  return { contains: condition.value }
}

function dateCondition(condition: WorkInstructionAdvancedCondition) {
  const start = new Date(`${condition.value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return null
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  if (condition.operator === 'equals') return { gte: start, lt: next }
  if (condition.operator === 'gt') return { gte: next }
  if (condition.operator === 'gte') return { gte: start }
  if (condition.operator === 'lt') return { lt: start }
  if (condition.operator === 'lte') return { lt: next }
  return null
}

async function ownerIdsByFileType(fileType: string | null) {
  if (fileType !== 'image' && fileType !== 'pdf' && fileType !== 'office') return null
  const rows = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'WORK_INSTRUCTION', deletedAt: null,
      ...(fileType === 'image' ? { mimeType: { startsWith: 'image/' } }
        : fileType === 'pdf' ? { mimeType: 'application/pdf' }
          : { mimeType: { in: [...officeAttachmentMimeTypes] } }),
    },
    select: { ownerId: true }, distinct: ['ownerId'],
  })
  return rows.map((row) => row.ownerId)
}

async function ownerIdsByAttachmentName(condition: WorkInstructionAdvancedCondition) {
  const rows = await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', deletedAt: null, originalName: stringCondition(condition) },
    select: { ownerId: true }, distinct: ['ownerId'],
  })
  return rows.map((row) => row.ownerId)
}

async function ownerIdsByAttachmentKeyword(keyword: string) {
  const rows = await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', deletedAt: null, OR: [{ originalName: { contains: keyword } }, { note: { contains: keyword } }] },
    select: { ownerId: true }, distinct: ['ownerId'],
  })
  return rows.map((row) => row.ownerId)
}

async function buildWhere(query: WorkInstructionListQuery): Promise<Prisma.WorkInstructionWhereInput> {
  const keywordTokens = tokenizeKeywordQuery(query.keyword)
  const [fileOwnerIds, attachmentOwnerIdsByToken, resolvedCategories] = await Promise.all([
    ownerIdsByFileType(query.fileType),
    Promise.all(keywordTokens.map(ownerIdsByAttachmentKeyword)),
    query.categoryIds.length === 0 ? [] : prisma.documentCategory.findMany({
      where: { OR: [{ id: { in: query.categoryIds } }, { parentId: { in: query.categoryIds } }] }, select: { id: true },
    }),
  ])
  const where: Prisma.WorkInstructionWhereInput = { deletedAt: null }
  const andFilters: Prisma.WorkInstructionWhereInput[] = []
  if (query.categoryIds.length > 0) where.categoryId = { in: resolvedCategories.map((category) => category.id) }
  if (query.statuses.length === 1) where.status = query.statuses[0]
  else if (query.statuses.length > 1) where.status = { in: query.statuses }
  if (query.customerId === '__UNASSIGNED__') andFilters.push({ OR: [{ materialId: null }, { material: { is: { customerId: null } } }] })
  else if (query.customerId) andFilters.push({ material: { is: { customerId: query.customerId } } })
  if (query.materialId === '__UNASSIGNED__') where.materialId = null
  else if (query.materialId) where.materialId = query.materialId
  if (fileOwnerIds) where.id = { in: fileOwnerIds }

  for (const condition of query.advancedConditions) {
    if (['title', 'version', 'contentText', 'note'].includes(condition.field)) {
      andFilters.push({ [condition.field]: stringCondition(condition) } as Prisma.WorkInstructionWhereInput)
    } else if (condition.field === 'categoryId' || condition.field === 'status') {
      andFilters.push({ [condition.field]: condition.value } as Prisma.WorkInstructionWhereInput)
    } else if (condition.field === 'materialCode') andFilters.push({ material: { is: { code: stringCondition(condition) } } })
    else if (condition.field === 'materialName') andFilters.push({ material: { is: { name: stringCondition(condition) } } })
    else if (condition.field === 'materialSpec') andFilters.push({ material: { is: { spec: stringCondition(condition) } } })
    else if (condition.field === 'customerCode') andFilters.push({ material: { is: { customer: { is: { code: stringCondition(condition) } } } } })
    else if (condition.field === 'customerName') andFilters.push({ material: { is: { customer: { is: { name: stringCondition(condition) } } } } })
    else if (condition.field === 'workCenter') {
      const filter = stringCondition(condition)
      andFilters.push({ workCenters: { some: { OR: [{ code: filter }, { name: filter }] } } })
    } else if (condition.field === 'attachmentName') {
      const ownerIds = await ownerIdsByAttachmentName(condition)
      andFilters.push({ id: { in: ownerIds } })
    } else if (condition.field === 'fileType') {
      andFilters.push({ id: { in: await ownerIdsByFileType(condition.value) || [] } })
    } else if (condition.field === 'createdAt' || condition.field === 'updatedAt') {
      const filter = dateCondition(condition)
      if (filter) andFilters.push({ [condition.field]: filter })
    }
  }
  andFilters.push(...keywordTokens.map((token, index) => ({ OR: [
    { title: { contains: token } }, { contentText: { contains: token } }, { note: { contains: token } },
    { category: { is: { name: { contains: token } } } }, { material: { is: { code: { contains: token } } } },
    { material: { is: { name: { contains: token } } } }, { material: { is: { customer: { is: { code: { contains: token } } } } } },
    { material: { is: { customer: { is: { name: { contains: token } } } } } },
    ...(attachmentOwnerIdsByToken[index].length > 0 ? [{ id: { in: attachmentOwnerIdsByToken[index] } }] : []),
  ] })))
  if (andFilters.length > 0) where.AND = andFilters
  return where
}

export async function listWorkInstructions(query: WorkInstructionListQuery) {
  const where = await buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.workInstruction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        material: { select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, valuationUnit: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
        workCenters: { select: { id: true, code: true, name: true, isActive: true } },
        fieldValues: {
          include: { fieldDefinition: { select: { id: true, name: true, fieldType: true, optionsJson: true, sortOrder: true } } },
          orderBy: { fieldDefinition: { sortOrder: 'asc' } },
        },
      },
      orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.workInstruction.count({ where }),
  ])
  const attachments = items.length === 0 ? [] : await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', ownerId: { in: items.map((item) => item.id) }, deletedAt: null },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, ownerId: true, originalName: true, mimeType: true, size: true, note: true, documentType: true, isCover: true, rotation: true, previewRevision: true, createdAt: true },
  })
  const attachmentsByOwner = new Map<string, typeof attachments>()
  for (const attachment of attachments) attachmentsByOwner.set(attachment.ownerId, [...(attachmentsByOwner.get(attachment.ownerId) || []), attachment])
  return {
    data: items.map((item) => {
      const itemAttachments = attachmentsByOwner.get(item.id) || []
      const primary = itemAttachments.find((attachment) => attachment.mimeType.startsWith('image/')) || itemAttachments[0]
      return {
        ...item,
        attachmentCount: itemAttachments.length,
        imageCount: itemAttachments.filter((attachment) => attachment.mimeType.startsWith('image/')).length,
        pdfCount: itemAttachments.filter((attachment) => attachment.mimeType === 'application/pdf').length,
        primaryAttachment: primary ? withAttachmentUrls(primary) : null,
      }
    }),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  }
}
