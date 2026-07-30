import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { normalizeConversionRate } from '@/lib/units'
import { parseCsvFilter } from '@/lib/status-filter'
import { sortByNaturalText } from '@/lib/natural-sort'
import { getSystemSettings } from '@/lib/system-settings'
import { findCatalogUnit, getUnitCatalog } from '@/lib/unit-catalog'

const materialSchema = z.object({
  code: z.string().min(1, '物料编码不能为空'),
  name: z.string().min(1, '物料名称不能为空'),
  spec: z.string().optional(),
  note: z.string().optional(),
  category: z.enum(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER']).optional(),
  customerId: z.string().optional(),
  primaryMeasure: z.enum(['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER']).optional(),
  referenceMeasure: z.enum(['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER']).optional(),
  unit: z.string().min(1, '单位不能为空'),
  stockUnit: z.string().optional(),
  valuationUnit: z.string().optional(),
  conversionRate: z.number().positive().optional(),
  conversionNote: z.string().optional(),
  costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
})

const materialSortFields = new Set(['createdAt', 'code', 'name', 'category', 'customer', 'spec', 'note', 'stockUnit', 'valuationUnit', 'costingMethod', 'stock', 'valuationStock'])

async function validateConfiguredMaterialUnits(input: {
  primaryMeasure: string
  stockUnit: string
  referenceMeasure?: string | null
  valuationUnit?: string | null
  legacy?: {
    primaryMeasure: string
    stockUnit: string
    referenceMeasure?: string | null
    valuationUnit?: string | null
  }
}) {
  const catalog = await getUnitCatalog()
  const stockConfigured = findCatalogUnit(catalog, input.primaryMeasure, input.stockUnit)
  const stockUnchanged = input.legacy
    && input.legacy.primaryMeasure === input.primaryMeasure
    && input.legacy.stockUnit === input.stockUnit
  if (!stockConfigured && !stockUnchanged) {
    return `主库存单位 ${input.stockUnit} 未在${input.primaryMeasure}计量方式下配置`
  }
  if (input.referenceMeasure) {
    const valuationConfigured = findCatalogUnit(catalog, input.referenceMeasure, input.valuationUnit)
    const valuationUnchanged = input.legacy
      && input.legacy.referenceMeasure === input.referenceMeasure
      && input.legacy.valuationUnit === input.valuationUnit
    if (!valuationConfigured && !valuationUnchanged) {
      return `参考/计价单位 ${input.valuationUnit || '空'} 未在${input.referenceMeasure}计量方式下配置`
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const category = searchParams.get('category')
    const categories = parseCsvFilter(searchParams.get('categories'))
    const customerId = searchParams.get('customerId')
    const rawPage = parseInt(searchParams.get('page') || '1')
    const rawPageSize = parseInt(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20
    const requestedSortBy = searchParams.get('sortBy') || 'createdAt'
    const sortBy = materialSortFields.has(requestedSortBy) ? requestedSortBy : 'createdAt'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const naturalCodeSortEnabled = sortBy === 'code'
      && (await getSystemSettings()).naturalMaterialCodeSortEnabled
    const orderBy: any = sortBy === 'customer'
      ? { customer: { name: sortDir } }
      : sortBy === 'stock'
        ? { stock: { qty: sortDir } }
        : sortBy === 'valuationStock'
          ? { stock: { valuationQty: sortDir } }
          : { [sortBy]: sortDir }

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

    const [queriedMaterials, total] = await Promise.all([
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
        ...(naturalCodeSortEnabled
          ? {}
          : {
              skip: (page - 1) * pageSize,
              take: pageSize,
              orderBy,
            }),
      }),
      prisma.material.count({ where }),
    ])

    const materials = naturalCodeSortEnabled
      ? sortByNaturalText(queriedMaterials, (material) => material.code, sortDir)
          .slice((page - 1) * pageSize, page * pageSize)
      : queriedMaterials

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
    const unitError = await validateConfiguredMaterialUnits({
      primaryMeasure: body.primaryMeasure || 'QUANTITY',
      stockUnit: body.stockUnit || body.unit,
      referenceMeasure: body.referenceMeasure || null,
      valuationUnit: body.valuationUnit || null,
    })
    if (unitError) return NextResponse.json({ error: unitError }, { status: 400 })

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
          note: body.note || null,
          category: body.category || 'RAW',
          customerId: body.customerId || null,
          primaryMeasure: body.primaryMeasure || 'QUANTITY',
          referenceMeasure: body.referenceMeasure || null,
          unit: body.stockUnit || body.unit,
          stockUnit: body.stockUnit || body.unit,
          valuationUnit: body.valuationUnit || body.unit,
          conversionRate: normalizeConversionRate(body.conversionRate),
          conversionNote: body.conversionNote || null,
          unitMode: (body.stockUnit || body.unit) === (body.valuationUnit || body.unit)
            && normalizeConversionRate(body.conversionRate) === 1 ? 'SINGLE' : 'DUAL',
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
        note: z.string().optional(),
        category: z.enum(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER']).optional(),
        customerId: z.string().optional(),
        primaryMeasure: z.enum(['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER']).optional(),
        referenceMeasure: z.enum(['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER']).optional(),
        unit: z.string().min(1),
        stockUnit: z.string().optional(),
        valuationUnit: z.string().optional(),
        conversionRate: z.number().positive().optional(),
        conversionNote: z.string().optional(),
        costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
        confirmEquivalentUnitChange: z.boolean().optional().default(false),
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

    const before = await prisma.material.findUnique({
      where: { id: body.id },
      include: { stock: true, _count: { select: { bomItems: true } } },
    })
    if (!before) return NextResponse.json({ error: '物料不存在' }, { status: 404 })
    const nextStockUnit = body.stockUnit || body.unit
    const nextValuationUnit = body.valuationUnit || body.unit
    const nextPrimaryMeasure = body.primaryMeasure || before.primaryMeasure || 'QUANTITY'
    const nextReferenceMeasure = body.referenceMeasure || null
    const unitError = await validateConfiguredMaterialUnits({
      primaryMeasure: nextPrimaryMeasure,
      stockUnit: nextStockUnit,
      referenceMeasure: nextReferenceMeasure,
      valuationUnit: nextValuationUnit,
      legacy: {
        primaryMeasure: before.primaryMeasure,
        stockUnit: before.stockUnit,
        referenceMeasure: before.referenceMeasure,
        valuationUnit: before.valuationUnit,
      },
    })
    if (unitError) return NextResponse.json({ error: unitError }, { status: 400 })
    const stockUnitChanged = before.stockUnit !== nextStockUnit
    const equivalentSingleUnitRename = stockUnitChanged
      && before.valuationUnit === before.stockUnit
      && nextValuationUnit === nextStockUnit
    const otherUnitsChanged = (before.valuationUnit !== nextValuationUnit && !equivalentSingleUnitRename)
      || before.primaryMeasure !== nextPrimaryMeasure
      || before.referenceMeasure !== nextReferenceMeasure
    const unitsChanged = stockUnitChanged
      || before.valuationUnit !== nextValuationUnit
      || before.primaryMeasure !== nextPrimaryMeasure
      || before.referenceMeasure !== nextReferenceMeasure
    if (stockUnitChanged && !body.confirmEquivalentUnitChange) {
      return NextResponse.json(
        { error: `主库存单位将从 ${before.stockUnit} 修改为 ${nextStockUnit}。该操作只适用于等价单位改名，必须先确认影响。` },
        { status: 409 },
      )
    }
    if (unitsChanged) {
      const [movementCount, outputBomCount] = await Promise.all([
        prisma.stockLog.count({ where: { stock: { materialId: before.id } } }),
        prisma.bOM.count({
          where: {
            product: { sku: { in: [before.code, `MAT-${before.code}`] } },
          },
        }),
      ])
      const hasBalance = before.stock
        ? ['qty', 'valuationQty', 'reservedQty', 'reservedValuationQty', 'totalCost']
            .some((field) => Math.abs(Number((before.stock as any)[field] || 0)) > 0.000001)
        : false
      if (otherUnitsChanged && (hasBalance || movementCount > 0 || before._count.bomItems > 0 || outputBomCount > 0)) {
        return NextResponse.json(
          { error: '物料已有库存、流水或 BOM 关系，不能直接修改主计量方式或参考/计价单位；请先完成单位转换或新建物料' },
          { status: 400 },
        )
      }
    }
    const material = await prisma.$transaction(async (tx) => {
      const updated = await tx.material.update({
        where: { id: body.id },
        data: {
          code: body.code,
          name: body.name,
          spec: body.spec || '',
          note: body.note || null,
          category: body.category || 'RAW',
          customerId: body.customerId || null,
          primaryMeasure: nextPrimaryMeasure,
          referenceMeasure: nextReferenceMeasure,
          unit: body.stockUnit || body.unit,
          stockUnit: body.stockUnit || body.unit,
          valuationUnit: body.valuationUnit || body.unit,
          conversionRate: normalizeConversionRate(body.conversionRate),
          conversionNote: body.conversionNote || null,
          unitMode: nextStockUnit === nextValuationUnit && normalizeConversionRate(body.conversionRate) === 1 ? 'SINGLE' : 'DUAL',
          unitVersion: unitsChanged ? { increment: 1 } : undefined,
          costingMethod: body.costingMethod || 'WEIGHTED_AVERAGE',
        },
      })

      await tx.stock.upsert({
        where: { materialId: updated.id },
        update: {},
        create: { materialId: updated.id },
      })

      if (stockUnitChanged) {
        await tx.bOMItem.updateMany({
          where: { materialId: updated.id, itemType: 'MATERIAL' },
          data: { unit: nextStockUnit },
        })
        await tx.product.updateMany({
          where: { sku: { in: [before.code, `MAT-${before.code}`] } },
          data: { unit: nextStockUnit },
        })
        await tx.bOM.updateMany({
          where: { product: { sku: { in: [before.code, `MAT-${before.code}`] } } },
          data: { outputUnit: nextStockUnit },
        })
      }

      return updated
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'MATERIAL',
      entityId: material.id,
      entityLabel: material.code,
      beforeData: before,
      afterData: {
        ...material,
        equivalentStockUnitRename: stockUnitChanged
          ? { from: before.stockUnit, to: nextStockUnit, numericValuesConverted: false }
          : null,
      },
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
