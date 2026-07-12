import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { normalizeConversionRate } from '@/lib/units'

const materialSchema = z.object({
  code: z.string().min(1, '物料编码不能为空'),
  name: z.string().min(1, '物料名称不能为空'),
  spec: z.string().optional(),
  unit: z.string().min(1, '单位不能为空'),
  stockUnit: z.string().optional(),
  valuationUnit: z.string().optional(),
  conversionRate: z.number().positive().optional(),
  conversionNote: z.string().optional(),
  costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: any = { deletedAt: null }
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ]
    }

    const [materials, total] = await Promise.all([
      prisma.material.findMany({
        where,
        include: {
          stock: {
            select: {
              qty: true,
              reservedQty: true,
              availableQty: true,
              valuationQty: true,
              reservedValuationQty: true,
              availableValuationQty: true,
              totalCost: true,
              valuationUnitCost: true,
              stockUnitCost: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.material.count({ where }),
    ])

    const materialIds = materials.map((material) => material.id)
    const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
      where: {
        ownerType: 'MATERIAL',
        ownerId: { in: materialIds },
        documentType: 'MATERIAL_IMAGE',
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true },
    })
    const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
    for (const image of images) {
      if (!primaryImageByMaterial.has(image.ownerId)) {
        primaryImageByMaterial.set(image.ownerId, image)
      }
    }

    const data = materials.map((material) => {
      const image = primaryImageByMaterial.get(material.id)
      return {
        ...material,
        primaryImage: image ? {
          id: image.id,
          url: `/api/attachments/${image.id}/file`,
          note: image.note,
          mimeType: image.mimeType,
          isCover: image.isCover,
        } : null,
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
    console.error('Get materials error:', error)
    return NextResponse.json({ error: '获取物料列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'create')
    if (denied) return denied

    const body = await req.json()
    const result = materialSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: '参数错误', details: result.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.material.findUnique({
      where: { code: body.code },
    })

    if (existing) {
      return NextResponse.json({ error: existing.deletedAt ? '物料编码已被已删除记录占用' : '物料编码已存在' }, { status: 400 })
    }

    const material = await prisma.material.create({
      data: {
        code: body.code,
        name: body.name,
        spec: body.spec || '',
        unit: body.stockUnit || body.unit,
        stockUnit: body.stockUnit || body.unit,
        valuationUnit: body.valuationUnit || body.unit,
        conversionRate: normalizeConversionRate(body.conversionRate),
        conversionNote: body.conversionNote || null,
        costingMethod: body.costingMethod || 'WEIGHTED_AVERAGE',
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'MATERIAL',
      entityId: material.id,
      entityLabel: material.code,
      afterData: material,
    })

    return NextResponse.json({ data: material }, { status: 201 })
  } catch (error) {
    console.error('Create material error:', error)
    return NextResponse.json({ error: '创建物料失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'update')
    if (denied) return denied

    const body = await req.json()
    const result = z
      .object({
        id: z.string().min(1),
        code: z.string().min(1),
        name: z.string().min(1),
        spec: z.string().optional(),
        unit: z.string().min(1),
        stockUnit: z.string().optional(),
        valuationUnit: z.string().optional(),
        conversionRate: z.number().positive().optional(),
        conversionNote: z.string().optional(),
        costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
      })
      .safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: '参数错误', details: result.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.material.findUnique({
      where: { code: body.code },
    })

    if (existing && existing.id !== body.id) {
      return NextResponse.json({ error: existing.deletedAt ? '物料编码已被已删除记录占用' : '物料编码已存在' }, { status: 400 })
    }

    const before = await prisma.material.findUnique({ where: { id: body.id } })
    const material = await prisma.material.update({
      where: { id: body.id },
      data: {
        code: body.code,
        name: body.name,
        spec: body.spec || '',
        unit: body.stockUnit || body.unit,
        stockUnit: body.stockUnit || body.unit,
        valuationUnit: body.valuationUnit || body.unit,
        conversionRate: normalizeConversionRate(body.conversionRate),
        conversionNote: body.conversionNote || null,
        costingMethod: body.costingMethod || 'WEIGHTED_AVERAGE',
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'MATERIAL',
      entityId: material.id,
      entityLabel: material.code,
      beforeData: before,
      afterData: material,
    })

    return NextResponse.json({ data: material })
  } catch (error) {
    console.error('Update material error:', error)
    return NextResponse.json({ error: '更新物料失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '物料ID不能为空' }, { status: 400 })
    }

    const material = await prisma.material.findUnique({ where: { id } })
    if (!material || material.deletedAt) {
      return NextResponse.json({ error: '物料不存在或已删除' }, { status: 404 })
    }

    const updated = await prisma.material.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    })

    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'MATERIAL',
      entityId: updated.id,
      entityLabel: updated.code,
      beforeData: material,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '物料已删除' })
  } catch (error) {
    console.error('Delete material error:', error)
    return NextResponse.json({ error: '删除物料失败' }, { status: 500 })
  }
}
