import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsvFilter } from '@/lib/status-filter'

const workInstructionSchema = z.object({
  code: z.string().min(1, '指导书编码必填'),
  title: z.string().min(1, '指导书标题必填'),
  category: z.enum(['PROCESS', 'QUALITY', 'PACKAGING', 'SAFETY', 'MAINTENANCE', 'OTHER']).optional(),
  version: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  customerId: z.string().optional(),
  materialId: z.string().optional(),
  processName: z.string().optional(),
  note: z.string().optional(),
})

const updateWorkInstructionSchema = workInstructionSchema.extend({
  id: z.string().min(1, '缺少指导书 ID'),
})

function withFileUrl<T extends { id: string }>(attachment: T) {
  return { ...attachment, url: `/api/attachments/${attachment.id}/file` }
}

function normalizeOptionalId(value: string | null | undefined) {
  return value && value !== '__UNASSIGNED__' ? value : null
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
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
    if (materialId === '__UNASSIGNED__') where.materialId = null
    else if (materialId) where.materialId = materialId
    if (fileOwnerIds) {
      where.id = fileOwnerIds.length > 0 ? { in: fileOwnerIds } : { in: [] }
    }
    if (keyword) {
      where.OR = [
        { code: { contains: keyword } },
        { title: { contains: keyword } },
        { processName: { contains: keyword } },
        { note: { contains: keyword } },
        { material: { is: { code: { contains: keyword } } } },
        { material: { is: { name: { contains: keyword } } } },
        { customer: { is: { code: { contains: keyword } } } },
        { customer: { is: { name: { contains: keyword } } } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.workInstruction.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, name: true } },
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
    return NextResponse.json({ error: '获取作业指导书失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = workInstructionSchema.parse(body)

    const existing = await prisma.workInstruction.findUnique({ where: { code: data.code } })
    if (existing) {
      return NextResponse.json({ error: existing.deletedAt ? '指导书编码已被已归档记录占用' : '指导书编码已存在' }, { status: 400 })
    }

    const instruction = await prisma.workInstruction.create({
      data: {
        code: data.code,
        title: data.title,
        category: data.category || 'PROCESS',
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        customerId: normalizeOptionalId(data.customerId),
        materialId: normalizeOptionalId(data.materialId),
        processName: data.processName || null,
        note: data.note || null,
      },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true, spec: true } },
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: instruction.code,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create work instruction error:', error)
    return NextResponse.json({ error: '创建作业指导书失败' }, { status: 500 })
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
      return NextResponse.json({ error: '作业指导书不存在或已归档' }, { status: 404 })
    }

    const existing = await prisma.workInstruction.findUnique({ where: { code: data.code } })
    if (existing && existing.id !== data.id) {
      return NextResponse.json({ error: existing.deletedAt ? '指导书编码已被已归档记录占用' : '指导书编码已存在' }, { status: 400 })
    }

    const instruction = await prisma.workInstruction.update({
      where: { id: data.id },
      data: {
        code: data.code,
        title: data.title,
        category: data.category || 'PROCESS',
        version: data.version || 'v1',
        status: data.status || 'ACTIVE',
        customerId: normalizeOptionalId(data.customerId),
        materialId: normalizeOptionalId(data.materialId),
        processName: data.processName || null,
        note: data.note || null,
      },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true, spec: true } },
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'WORK_INSTRUCTION',
      entityId: instruction.id,
      entityLabel: instruction.code,
      beforeData: current,
      afterData: instruction,
    })

    return NextResponse.json({ data: instruction, message: '作业指导书已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update work instruction error:', error)
    return NextResponse.json({ error: '更新作业指导书失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少作业指导书 ID' }, { status: 400 })

    const instruction = await prisma.workInstruction.findUnique({ where: { id } })
    if (!instruction || instruction.deletedAt) {
      return NextResponse.json({ error: '作业指导书不存在或已归档' }, { status: 404 })
    }

    const archived = await prisma.workInstruction.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'WORK_INSTRUCTION',
      entityId: archived.id,
      entityLabel: archived.code,
      beforeData: instruction,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '作业指导书已归档' })
  } catch (error) {
    console.error('Archive work instruction error:', error)
    return NextResponse.json({ error: '归档作业指导书失败' }, { status: 500 })
  }
}
