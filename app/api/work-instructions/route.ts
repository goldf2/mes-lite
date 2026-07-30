import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsvFilter } from '@/lib/status-filter'

const workInstructionSchema = z.object({
  materialId: z.string().min(1, '请选择关联产品'),
  category: z.enum(['WORK_INSTRUCTION', 'DRAWING', 'PROCESS', 'QUALITY', 'PACKAGING', 'EQUIPMENT', 'OTHER']).optional(),
  version: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  processName: z.string().optional(),
  note: z.string().optional(),
})

const updateWorkInstructionSchema = workInstructionSchema.extend({
  id: z.string().min(1, '缺少产品文档 ID'),
})

function withFileUrl<T extends { id: string }>(attachment: T) {
  return { ...attachment, url: `/api/attachments/${attachment.id}/file` }
}

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
    const categories = parseCsvFilter(searchParams.get('categories'))
    const statuses = parseCsvFilter(searchParams.get('statuses'))
    const customerId = searchParams.get('customerId')
    const materialId = searchParams.get('materialId')
    const fileType = searchParams.get('fileType')
    const rawPage = Number(searchParams.get('page') || '1')
    const rawPageSize = Number(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20
    const fileOwnerIds = await ownerIdsByFileType(fileType)

    const where: any = { deletedAt: null }
    const andFilters: any[] = []
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
    if (customerId === '__UNASSIGNED__') {
      andFilters.push({ material: { is: { customerId: null } } })
    } else if (customerId) {
      andFilters.push({ material: { is: { customerId } } })
    }
    if (materialId === '__UNASSIGNED__') where.id = { in: [] }
    else if (materialId) where.materialId = materialId
    if (fileOwnerIds) {
      where.id = fileOwnerIds.length > 0 ? { in: fileOwnerIds } : { in: [] }
    }
    if (keyword) {
      where.OR = [
        { processName: { contains: keyword } },
        { note: { contains: keyword } },
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
        primaryAttachment: primary ? withFileUrl(primary) : null,
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
    const material = await prisma.material.findFirst({
      where: { id: data.materialId, category: 'FINISHED', deletedAt: null },
      select: { id: true, code: true, name: true },
    })
    if (!material) {
      return NextResponse.json({ error: '关联产品不存在或已归档' }, { status: 400 })
    }

    const instruction = await prisma.workInstruction.create({
      data: {
        category: data.category || 'WORK_INSTRUCTION',
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        materialId: material.id,
        processName: data.processName || null,
        note: data.note || null,
      },
      include: {
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
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: `${material.code} · ${material.name}`,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
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

    const current = await prisma.workInstruction.findUnique({ where: { id: data.id } })
    if (!current || current.deletedAt) {
      return NextResponse.json({ error: '产品文档不存在或已归档' }, { status: 404 })
    }

    const material = await prisma.material.findFirst({
      where: { id: data.materialId, category: 'FINISHED', deletedAt: null },
      select: { id: true, code: true, name: true },
    })
    if (!material) {
      return NextResponse.json({ error: '关联产品不存在或已归档' }, { status: 400 })
    }

    const instruction = await prisma.workInstruction.update({
      where: { id: data.id },
      data: {
        category: data.category || 'WORK_INSTRUCTION',
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        materialId: material.id,
        processName: data.processName || null,
        note: data.note || null,
      },
      include: {
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
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: `${material.code} · ${material.name}`,
      beforeData: current,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction, message: '产品文档已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
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
      entityLabel: `${instruction.material.code} · ${instruction.material.name}`,
      beforeData: instruction,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '产品文档已归档' })
  } catch (error) {
    console.error('Archive work instruction error:', error)
    return NextResponse.json({ error: '归档产品文档失败' }, { status: 500 })
  }
}
