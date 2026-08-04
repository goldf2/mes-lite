import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsvFilter } from '@/lib/status-filter'
import { withAttachmentUrls } from '@/lib/attachment-urls'
import { DocumentContentValidationError, normalizeDocumentContent } from '@/lib/document-content'

const workInstructionSchema = z.object({
  title: z.string().trim().min(1, '请输入文档标题').max(200, '文档标题不能超过 200 个字符'),
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

async function ownerIdsByFileType(fileType: string | null) {
  if (fileType !== 'image' && fileType !== 'pdf') return null

  const rows = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'WORK_INSTRUCTION',
      deletedAt: null,
      ...(fileType === 'image'
        ? { mimeType: { startsWith: 'image/' } }
        : { mimeType: 'application/pdf' }),
    },
    select: { ownerId: true },
    distinct: ['ownerId'],
  })

  return rows.map((row) => row.ownerId)
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
    const rawPage = Number(searchParams.get('page') || '1')
    const rawPageSize = Number(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20
    const fileOwnerIds = await ownerIdsByFileType(fileType)
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
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { contentText: { contains: keyword } },
        { note: { contains: keyword } },
        { category: { is: { name: { contains: keyword } } } },
        { material: { is: { code: { contains: keyword } } } },
        { material: { is: { name: { contains: keyword } } } },
        { material: { is: { customer: { is: { code: { contains: keyword } } } } } },
        { material: { is: { customer: { is: { name: { contains: keyword } } } } } },
      ]
    }
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
      select: { id: true },
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
    const instruction = await prisma.workInstruction.create({
      data: {
        categoryId: category.id,
        title: data.title,
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
      select: { id: true },
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
    const instruction = await prisma.workInstruction.update({
      where: { id: data.id },
      data: {
        categoryId: category.id,
        title: data.title,
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
