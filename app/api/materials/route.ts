import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { createAuditLog, getAuditContext, writeAuditLog } from '@/lib/audit'
import { normalizeConversionRate } from '@/lib/units'
import { parseCsvFilter } from '@/lib/status-filter'
import { sortByNaturalText } from '@/lib/natural-sort'
import { getSystemSettings } from '@/lib/system-settings'
import { findCatalogUnit, getUnitCatalog } from '@/lib/unit-catalog'
import { getBomStatusRelationFilters } from '@/lib/bom-status-filter'
import { simpleProductSku } from '@/lib/material-product'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

const materialAdvancedConditionSchema = z.object({
  field: z.enum(['code', 'name', 'spec', 'category', 'customerId', 'primaryMeasure', 'stockUnit', 'valuationUnit', 'costingMethod', 'bomStatus', 'note', 'createdAt']),
  operator: z.enum(['equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']),
  value: z.string().trim().min(1).max(200),
})

type MaterialAdvancedCondition = z.infer<typeof materialAdvancedConditionSchema>

function parseAdvancedSearch(value: string | null) {
  if (!value) return { data: [] as MaterialAdvancedCondition[] }
  try {
    const parsed = z.array(materialAdvancedConditionSchema).max(30).safeParse(JSON.parse(value))
    return parsed.success ? { data: parsed.data } : { error: '高级搜索条件无效' }
  } catch {
    return { error: '高级搜索条件格式错误' }
  }
}

function stringCondition(condition: MaterialAdvancedCondition) {
  if (condition.operator === 'equals') return { equals: condition.value }
  if (condition.operator === 'startsWith') return { startsWith: condition.value }
  return { contains: condition.value }
}

function dateCondition(condition: MaterialAdvancedCondition) {
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
  defaultSalePrice: z.number().finite().nonnegative().nullable().optional(),
  salesCurrency: z.enum(['CNY']).optional(),
})

const materialSortFields = new Set(['createdAt', 'code', 'name', 'category', 'customer', 'spec', 'note', 'stockUnit', 'valuationUnit', 'costingMethod', 'stock', 'valuationStock', 'bomSummary'])

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
    const bomStatus = searchParams.get('bomStatus')
    const advancedSearch = parseAdvancedSearch(searchParams.get('advanced'))
    if (advancedSearch.error) return NextResponse.json({ error: advancedSearch.error }, { status: 400 })
    const advancedConditions = advancedSearch.data || []
    const requestedSortBy = searchParams.get('sortBy') || 'createdAt'
    if (bomStatus || requestedSortBy === 'bomSummary' || advancedConditions.some((condition) => condition.field === 'bomStatus')) {
      const bomDenied = await requireResourcePermission('bomCost', 'read')
      if (bomDenied) return bomDenied
    }
    const rawPage = parseInt(searchParams.get('page') || '1')
    const rawPageSize = parseInt(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20
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
          : sortBy === 'bomSummary'
            ? undefined
            : { [sortBy]: sortDir }

    const where: any = { deletedAt: null }
    const andFilters: any[] = []
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    else if (category) where.category = category
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
    andFilters.push(...getBomStatusRelationFilters(bomStatus))
    for (const condition of advancedConditions) {
      if (['code', 'name', 'spec', 'stockUnit', 'valuationUnit', 'note'].includes(condition.field)) {
        andFilters.push({ [condition.field]: stringCondition(condition) })
      } else if (condition.field === 'category' || condition.field === 'primaryMeasure' || condition.field === 'costingMethod') {
        andFilters.push({ [condition.field]: condition.value })
      } else if (condition.field === 'customerId') {
        andFilters.push({ customerId: condition.value === '__UNASSIGNED__' ? null : condition.value })
      } else if (condition.field === 'bomStatus') {
        andFilters.push(...getBomStatusRelationFilters(condition.value))
      } else if (condition.field === 'createdAt') {
        const filter = dateCondition(condition)
        if (filter) andFilters.push({ createdAt: filter })
      }
    }
    andFilters.push(...tokenizeKeywordQuery(keyword || '').map((token) => ({ OR: [
      { name: { contains: token } },
      { code: { contains: token } },
      { spec: { contains: token } },
      { note: { contains: token } },
      { customer: { is: { code: { contains: token } } } },
      { customer: { is: { name: { contains: token } } } },
    ] })))
    if (andFilters.length > 0) where.AND = andFilters

    const materialInclude = {
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
    } as const

    let materials
    let total
    if (sortBy === 'bomSummary') {
      const [sortableMaterials, bomProducts] = await Promise.all([
        prisma.material.findMany({ where, select: { id: true, code: true } }),
        prisma.product.findMany({
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: {
            sku: true,
            boms: {
              orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                isActive: true,
                isDefault: true,
                items: {
                  where: { itemType: 'MATERIAL', materialId: { not: null } },
                  select: { materialId: true },
                },
              },
            },
          },
        }),
      ])
      const summaryCountByMaterialId = new Map<string, number>()
      const productBySku = new Map(bomProducts.flatMap((product) => [
        [product.sku, product] as const,
        [product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku, product] as const,
      ]))
      for (const material of sortableMaterials) {
        const product = productBySku.get(material.code) || productBySku.get(simpleProductSku(material.code))
        const bom = product?.boms.find((item) => item.isActive && item.isDefault)
          || product?.boms.find((item) => item.isActive)
          || product?.boms[0]
        if (!bom) continue
        summaryCountByMaterialId.set(
          material.id,
          (summaryCountByMaterialId.get(material.id) || 0) + bom.items.length,
        )
        for (const item of bom.items) {
          if (!item.materialId) continue
          summaryCountByMaterialId.set(item.materialId, (summaryCountByMaterialId.get(item.materialId) || 0) + 1)
        }
      }
      const direction = sortDir === 'asc' ? 1 : -1
      const sortedMaterialIds = sortableMaterials
        .sort((left, right) => {
          const countDifference = ((summaryCountByMaterialId.get(left.id) || 0) - (summaryCountByMaterialId.get(right.id) || 0)) * direction
          return countDifference || left.code.localeCompare(right.code, 'zh-CN', { numeric: true, sensitivity: 'base' })
        })
        .slice((page - 1) * pageSize, page * pageSize)
        .map((material) => material.id)
      const pagedMaterials = sortedMaterialIds.length === 0
        ? []
        : await prisma.material.findMany({
            where: { id: { in: sortedMaterialIds } },
            include: materialInclude,
          })
      const materialById = new Map(pagedMaterials.map((material) => [material.id, material]))
      materials = sortedMaterialIds.flatMap((id) => {
        const material = materialById.get(id)
        return material ? [material] : []
      })
      total = sortableMaterials.length
    } else {
      const [queriedMaterials, materialCount] = await Promise.all([
        prisma.material.findMany({
          where,
          include: materialInclude,
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
      materials = naturalCodeSortEnabled
        ? sortByNaturalText(queriedMaterials, (material) => material.code, sortDir)
            .slice((page - 1) * pageSize, page * pageSize)
        : queriedMaterials
      total = materialCount
    }

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
      select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
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
        primaryImage: image ? withMaterialImageUrls(image) : null,
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
          defaultSalePrice: body.defaultSalePrice ?? null,
          salesCurrency: body.salesCurrency || 'CNY',
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
        defaultSalePrice: z.number().finite().nonnegative().nullable().optional(),
        salesCurrency: z.enum(['CNY']).optional(),
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
    const unitsChanged = before.stockUnit !== nextStockUnit
      || before.valuationUnit !== nextValuationUnit
      || before.primaryMeasure !== nextPrimaryMeasure
      || before.referenceMeasure !== nextReferenceMeasure
    const unitChangeAuditContext = unitsChanged ? await getAuditContext(req) : null
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
          defaultSalePrice: body.defaultSalePrice ?? null,
          salesCurrency: body.salesCurrency || 'CNY',
        },
      })

      await tx.stock.upsert({
        where: { materialId: updated.id },
        update: {},
        create: { materialId: updated.id },
      })

      if (unitChangeAuditContext) {
        await createAuditLog(tx, unitChangeAuditContext, {
          action: 'UNIT_CHANGE',
          entityType: 'MATERIAL',
          entityId: updated.id,
          entityLabel: updated.code,
          beforeData: before,
          afterData: {
            ...updated,
            unitChange: {
              numericValuesConverted: false,
              relatedRecordsUpdated: false,
              from: {
                primaryMeasure: before.primaryMeasure,
                stockUnit: before.stockUnit,
                referenceMeasure: before.referenceMeasure,
                valuationUnit: before.valuationUnit,
              },
              to: {
                primaryMeasure: nextPrimaryMeasure,
                stockUnit: nextStockUnit,
                referenceMeasure: nextReferenceMeasure,
                valuationUnit: nextValuationUnit,
              },
            },
          },
          note: '修改物料计量设置；未换算任何数值，也未改写历史单据、库存流水、成本层或既有 BOM',
        })
      }

      return updated
    })

    if (!unitsChanged) {
      await writeAuditLog(req, {
        action: 'UPDATE',
        entityType: 'MATERIAL',
        entityId: material.id,
        entityLabel: material.code,
        beforeData: before,
        afterData: material,
      })
    }

    return NextResponse.json({ data: material })
  } catch (error) {
    console.error('Update material error:', error)
    return NextResponse.json({ error: '更新物料失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({ error: '物料不允许删除，请使用归档' }, { status: 405 })
}
