import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsvFilter } from '@/lib/status-filter'
import { withAttachmentUrls } from '@/lib/attachment-urls'
import { DocumentContentValidationError, normalizeDocumentContent } from '@/lib/document-content'
import { officeAttachmentMimeTypes } from '@/lib/attachment-file-types'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

const advancedSearchFieldSchema = z.enum([
  'title',
  'categoryId',
  'status',
  'version',
  'materialCode',
  'materialName',
  'materialSpec',
  'customerCode',
  'customerName',
  'workCenter',
  'contentText',
  'note',
  'attachmentName',
  'fileType',
  'createdAt',
  'updatedAt',
])

const advancedSearchConditionSchema = z.object({
  field: advancedSearchFieldSchema,
  operator: z.enum(['equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']),
  value: z.string().trim().min(1).max(200),
})

type AdvancedSearchCondition = z.infer<typeof advancedSearchConditionSchema>

const workInstructionSchema = z.object({
  title: z.string().trim().max(200, '文档标题不能超过 200 个字符').optional().default(''),
  materialId: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1, '请选择文档类别'),
  version: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  workCenterIds: z.array(z.string()).default([]),
  contentJson: z.string().optional().nullable(),
  note: z.string().optional(),
})

const updateWorkInstructionSchema = workInstructionSchema.extend({
  id: z.string().min(1, '缺少产品文档 ID'),
})

function createAutomaticTitle(
  material: { code: string; name: string } | null,
  category: { name: string },
) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  const timestamp = `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`
  const scope = material ? `${material.code} ${material.name}` : '通用'
  return `${scope} · ${category.name} · ${timestamp}`.slice(0, 200)
}

async function ownerIdsByFileType(fileType: string | null) {
  if (fileType !== 'image' && fileType !== 'pdf' && fileType !== 'office') return null

  const rows = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'WORK_INSTRUCTION',
      deletedAt: null,
      ...(fileType === 'image'
        ? { mimeType: { startsWith: 'image/' } }
        : fileType === 'pdf'
          ? { mimeType: 'application/pdf' }
          : { mimeType: { in: [...officeAttachmentMimeTypes] } }),
    },
    select: { ownerId: true },
    distinct: ['ownerId'],
  })

  return rows.map((row) => row.ownerId)
}

async function ownerIdsByAttachmentKeyword(keyword: string | undefined) {
  if (!keyword) return []
  const rows = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'WORK_INSTRUCTION',
      deletedAt: null,
      OR: [
        { originalName: { contains: keyword } },
        { note: { contains: keyword } },
      ],
    },
    select: { ownerId: true },
    distinct: ['ownerId'],
  })
  return rows.map((row) => row.ownerId)
}

function stringCondition(condition: AdvancedSearchCondition) {
  if (condition.operator === 'equals') return { equals: condition.value }
  if (condition.operator === 'startsWith') return { startsWith: condition.value }
  return { contains: condition.value }
}

function dateCondition(condition: AdvancedSearchCondition) {
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

async function ownerIdsByAttachmentCondition(condition: AdvancedSearchCondition) {
  const rows = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'WORK_INSTRUCTION',
      deletedAt: null,
      originalName: stringCondition(condition),
    },
    select: { ownerId: true },
    distinct: ['ownerId'],
  })
  return rows.map((row) => row.ownerId)
}

function parseAdvancedSearch(value: string | null) {
  if (!value) return { data: [] as AdvancedSearchCondition[] }
  try {
    const parsed = z.array(advancedSearchConditionSchema).max(30).safeParse(JSON.parse(value))
    return parsed.success ? { data: parsed.data } : { error: '高级搜索条件无效' }
  } catch {
    return { error: '高级搜索条件格式错误' }
  }
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const categoryIds = parseCsvFilter(searchParams.get('categoryIds'))
    const statuses = parseCsvFilter(searchParams.get('statuses'))
    const customerId = searchParams.get('customerId')
    const materialId = searchParams.get('materialId')
    const fileType = searchParams.get('fileType')
    const advancedSearch = parseAdvancedSearch(searchParams.get('advanced'))
    if (advancedSearch.error) return NextResponse.json({ error: advancedSearch.error }, { status: 400 })
    const advancedConditions = advancedSearch.data || []
    const rawPage = Number(searchParams.get('page') || '1')
    const rawPageSize = Number(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20
    const fileOwnerIds = await ownerIdsByFileType(fileType)
    const keywordTokens = tokenizeKeywordQuery(keyword || '')
    const attachmentKeywordOwnerIdsByToken = await Promise.all(keywordTokens.map(ownerIdsByAttachmentKeyword))
    const resolvedCategoryIds = categoryIds.length === 0 ? [] : (await prisma.documentCategory.findMany({
      where: {
        OR: [
          { id: { in: categoryIds } },
          { parentId: { in: categoryIds } },
        ],
      },
      select: { id: true },
    })).map((category) => category.id)

    const where: any = { deletedAt: null }
    const andFilters: any[] = []
    if (categoryIds.length > 0) where.categoryId = { in: resolvedCategoryIds }
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
    if (customerId === '__UNASSIGNED__') {
      andFilters.push({ OR: [{ materialId: null }, { material: { is: { customerId: null } } }] })
    } else if (customerId) {
      andFilters.push({ material: { is: { customerId } } })
    }
    if (materialId === '__UNASSIGNED__') where.materialId = null
    else if (materialId) where.materialId = materialId
    if (fileOwnerIds) {
      where.id = fileOwnerIds.length > 0 ? { in: fileOwnerIds } : { in: [] }
    }
    for (const condition of advancedConditions) {
      if (condition.field === 'title' || condition.field === 'version' || condition.field === 'contentText' || condition.field === 'note') {
        andFilters.push({ [condition.field]: stringCondition(condition) })
      } else if (condition.field === 'categoryId' || condition.field === 'status') {
        andFilters.push({ [condition.field]: condition.value })
      } else if (condition.field === 'materialCode') {
        andFilters.push({ material: { is: { code: stringCondition(condition) } } })
      } else if (condition.field === 'materialName') {
        andFilters.push({ material: { is: { name: stringCondition(condition) } } })
      } else if (condition.field === 'materialSpec') {
        andFilters.push({ material: { is: { spec: stringCondition(condition) } } })
      } else if (condition.field === 'customerCode') {
        andFilters.push({ material: { is: { customer: { is: { code: stringCondition(condition) } } } } })
      } else if (condition.field === 'customerName') {
        andFilters.push({ material: { is: { customer: { is: { name: stringCondition(condition) } } } } })
      } else if (condition.field === 'workCenter') {
        const filter = stringCondition(condition)
        andFilters.push({ workCenters: { some: { OR: [{ code: filter }, { name: filter }] } } })
      } else if (condition.field === 'attachmentName') {
        const ownerIds = await ownerIdsByAttachmentCondition(condition)
        andFilters.push({ id: ownerIds.length > 0 ? { in: ownerIds } : { in: [] } })
      } else if (condition.field === 'fileType') {
        const ownerIds = await ownerIdsByFileType(condition.value)
        andFilters.push({ id: ownerIds && ownerIds.length > 0 ? { in: ownerIds } : { in: [] } })
      } else if (condition.field === 'createdAt' || condition.field === 'updatedAt') {
        const filter = dateCondition(condition)
        if (filter) andFilters.push({ [condition.field]: filter })
      }
    }
    andFilters.push(...keywordTokens.map((token, index) => ({ OR: [
      { title: { contains: token } },
      { contentText: { contains: token } },
      { note: { contains: token } },
      { category: { is: { name: { contains: token } } } },
      { material: { is: { code: { contains: token } } } },
      { material: { is: { name: { contains: token } } } },
      { material: { is: { customer: { is: { code: { contains: token } } } } } },
      { material: { is: { customer: { is: { name: { contains: token } } } } } },
      ...(attachmentKeywordOwnerIdsByToken[index].length > 0 ? [{ id: { in: attachmentKeywordOwnerIdsByToken[index] } }] : []),
    ] })))
    if (andFilters.length > 0) where.AND = andFilters

    const [items, total] = await Promise.all([
      prisma.workInstruction.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              parentId: true,
              parent: { select: { id: true, name: true } },
            },
          },
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              spec: true,
              category: true,
              stockUnit: true,
              valuationUnit: true,
              customerId: true,
              customer: { select: { id: true, code: true, name: true } },
            },
          },
          workCenters: { select: { id: true, code: true, name: true, isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.workInstruction.count({ where }),
    ])

    const ids = items.map((item) => item.id)
    const attachments = ids.length === 0 ? [] : await prisma.documentAttachment.findMany({
      where: {
        ownerType: 'WORK_INSTRUCTION',
        ownerId: { in: ids },
        deletedAt: null,
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        ownerId: true,
        originalName: true,
        mimeType: true,
        size: true,
        note: true,
        documentType: true,
        isCover: true,
        rotation: true,
        createdAt: true,
      },
    })

    const attachmentsByOwner = new Map<string, typeof attachments>()
    for (const attachment of attachments) {
      const list = attachmentsByOwner.get(attachment.ownerId) || []
      list.push(attachment)
      attachmentsByOwner.set(attachment.ownerId, list)
    }

    const data = items.map((item) => {
      const itemAttachments = attachmentsByOwner.get(item.id) || []
      const primary = itemAttachments.find((attachment) => attachment.mimeType.startsWith('image/')) || itemAttachments[0]
      return {
        ...item,
        attachmentCount: itemAttachments.length,
        imageCount: itemAttachments.filter((attachment) => attachment.mimeType.startsWith('image/')).length,
        pdfCount: itemAttachments.filter((attachment) => attachment.mimeType === 'application/pdf').length,
        primaryAttachment: primary ? withAttachmentUrls(primary) : null,
      }
    })

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Get work instructions error:', error)
    return NextResponse.json({ error: '获取产品文档失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = workInstructionSchema.parse(body)
    const materialId = data.materialId || null
    const material = materialId ? await prisma.material.findFirst({
      where: { id: materialId, category: 'FINISHED', deletedAt: null },
      select: { id: true, code: true, name: true },
    }) : null
    if (materialId && !material) {
      return NextResponse.json({ error: '关联产品不存在或已归档' }, { status: 400 })
    }
    const category = await prisma.documentCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true, name: true },
    })
    if (!category) {
      return NextResponse.json({ error: '文档类别不存在' }, { status: 400 })
    }
    const workCenterCount = await prisma.workCenter.count({
      where: { id: { in: data.workCenterIds }, isActive: true, deletedAt: null },
    })
    if (workCenterCount !== new Set(data.workCenterIds).size) {
      return NextResponse.json({ error: '存在无效或已停用的工作中心' }, { status: 400 })
    }

    const content = normalizeDocumentContent(data.contentJson)
    const title = data.title || createAutomaticTitle(material, category)
    const instruction = await prisma.workInstruction.create({
      data: {
        categoryId: category.id,
        title,
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        materialId: material?.id || null,
        workCenters: { connect: Array.from(new Set(data.workCenterIds)).map((id) => ({ id })) },
        ...content,
        note: data.note || null,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            parentId: true,
            parent: { select: { id: true, name: true } },
          },
        },
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            spec: true,
            category: true,
            customerId: true,
            customer: { select: { id: true, code: true, name: true } },
          },
        },
        workCenters: { select: { id: true, code: true, name: true, isActive: true } },
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: instruction.title,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof DocumentContentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Create work instruction error:', error)
    return NextResponse.json({ error: '创建产品文档失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied

    const body = await req.json()
    const data = updateWorkInstructionSchema.parse(body)

    const current = await prisma.workInstruction.findUnique({
      where: { id: data.id },
      include: { workCenters: { select: { id: true, code: true, name: true } } },
    })
    if (!current || current.deletedAt) {
      return NextResponse.json({ error: '产品文档不存在或已归档' }, { status: 404 })
    }

    const materialId = data.materialId || null
    const material = materialId ? await prisma.material.findFirst({
      where: { id: materialId, category: 'FINISHED', deletedAt: null },
      select: { id: true, code: true, name: true },
    }) : null
    if (materialId && !material) {
      return NextResponse.json({ error: '关联产品不存在或已归档' }, { status: 400 })
    }
    const category = await prisma.documentCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true, name: true },
    })
    if (!category) {
      return NextResponse.json({ error: '文档类别不存在' }, { status: 400 })
    }
    const workCenterCount = await prisma.workCenter.count({
      where: { id: { in: data.workCenterIds }, isActive: true, deletedAt: null },
    })
    if (workCenterCount !== new Set(data.workCenterIds).size) {
      return NextResponse.json({ error: '存在无效或已停用的工作中心' }, { status: 400 })
    }

    const content = normalizeDocumentContent(data.contentJson)
    const title = data.title || createAutomaticTitle(material, category)
    const instruction = await prisma.workInstruction.update({
      where: { id: data.id },
      data: {
        categoryId: category.id,
        title,
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        materialId: material?.id || null,
        workCenters: { set: Array.from(new Set(data.workCenterIds)).map((id) => ({ id })) },
        ...content,
        note: data.note || null,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            parentId: true,
            parent: { select: { id: true, name: true } },
          },
        },
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            spec: true,
            category: true,
            customerId: true,
            customer: { select: { id: true, code: true, name: true } },
          },
        },
        workCenters: { select: { id: true, code: true, name: true, isActive: true } },
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: instruction.title,
      beforeData: current,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction, message: '产品文档已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof DocumentContentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Update work instruction error:', error)
    return NextResponse.json({ error: '更新产品文档失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少产品文档 ID' }, { status: 400 })

    const instruction = await prisma.workInstruction.findUnique({
      where: { id },
      include: { material: { select: { code: true, name: true } } },
    })
    if (!instruction || instruction.deletedAt) {
      return NextResponse.json({ error: '产品文档不存在或已归档' }, { status: 404 })
    }

    const archived = await prisma.workInstruction.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'WORK_INSTRUCTION',
      entityId: archived.id,
      entityLabel: instruction.title,
      beforeData: instruction,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '文档已归档' })
  } catch (error) {
    console.error('Archive work instruction error:', error)
    return NextResponse.json({ error: '归档产品文档失败' }, { status: 500 })
  }
}
