import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { normalizeConversionRate } from '@/lib/units'
import { parseCsvFilter } from '@/lib/status-filter'

const materialSchema = z.object({
  code: z.string().min(1, '物料编码不能为空'),
  name: z.string().min(1, '物料名称不能为空'),
  spec: z.string().optional(),
  category: z.enum(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER']).optional(),
  customerId: z.string().optional(),
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
    const category = searchParams.get('category')
    const categories = parseCsvFilter(searchParams.get('categories'))
    const customerId = searchParams.get('customerId')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: any = { deletedAt: null }
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    else if (category) where.category = category
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
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
          customer: { select: { id: true, code: true, name: true } },
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
      return NextResponse.json({ error: existing.deletedAt ? '物料编码已被已归档记录占用' : '物料编码已存在' }, { status: 400 })
    }

    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.material.create({
        data: {
          code: body.code,
          name: body.name,
          spec: body.spec || '',
          category: body.category || 'RAW',
          customerId: body.customerId || null,
          unit: body.stockUnit || body.unit,
          stockUnit: body.stockUnit || body.unit,
          valuationUnit: body.valuationUnit || body.unit,
          conversionRate: normalizeConversionRate(body.conversionRate),
          conversionNote: body.conversionNote || null,
          costingMethod: body.costingMethod || 'WEIGHTED_AVERAGE',
        },
      })

      await tx.stock.create({
        data: { materialId: created.id },
      })

      return created
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
        category: z.enum(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER']).optional(),
        customerId: z.string().optional(),
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
      return NextResponse.json({ error: existing.deletedAt ? '物料编码已被已归档记录占用' : '物料编码已存在' }, { status: 400 })
    }

    const before = await prisma.material.findUnique({ where: { id: body.id } })
    const material = await prisma.material.update({
      where: { id: body.id },
      data: {
        code: body.code,
        name: body.name,
        spec: body.spec || '',
        category: body.category || 'RAW',
        customerId: body.customerId || null,
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
  return NextResponse.json({ error: '物料不允许删除，请使用归档' }, { status: 405 })
}
