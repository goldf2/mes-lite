import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'
import { materialInPriceUnits, normalizeMaterialInPriceUnit, resolveMaterialInPricing, resolveMaterialInStockQuantity } from '@/lib/material-in-quantity'
import { resolveInventoryLocation } from '@/lib/inventory'
import { Prisma } from '@prisma/client'

const materialInCommonShape = {
  voucherNo: z.string().optional(),
  supplierId: z.string().min(1, '供应商必填'),
  receivedBy: z.string().optional(),
  note: z.string().optional(),
}

const materialInItemShape = {
  materialId: z.string().min(1, '物料必填'),
  locationId: z.string().min(1, '库位必填').optional(),
  qty: z.number().positive('数量必须大于 0'),
  pieceCount: z.number().int().positive('数量必须为正整数').optional(),
  stockQtyMode: z.enum(['TOTAL', 'PER_PIECE']).optional(),
  stockQtyInput: z.number().positive('长度必须大于 0').optional(),
  totalLength: z.number().nonnegative('总长度不能为负').optional(),
  totalWeight: z.number().nonnegative('总重量不能为负').optional(),
  unit: z.string().optional(),
  valuationQty: z.number().nonnegative('核算数量不能为负').optional(),
  valuationUnit: z.string().optional(),
  unitPrice: z.number().nonnegative('单价不能为负'),
  totalAmount: z.number().nonnegative('总价格不能为负').optional(),
  priceBasis: z.enum(['VALUATION', 'STOCK']).optional(),
  priceUnit: z.enum(materialInPriceUnits).optional(),
  batchNo: z.string().optional(),
}

const materialInItemSchema = z.object(materialInItemShape)
const createMaterialInSchema = z.union([
  z.object({ ...materialInCommonShape, ...materialInItemShape }),
  z.object({
    ...materialInCommonShape,
    items: z.array(materialInItemSchema).min(1, '请至少添加一种物料').max(100, '单张来料单最多添加 100 种物料'),
  }),
])

type MaterialInItemInput = z.infer<typeof materialInItemSchema>

async function createMaterialInLine(
  tx: Prisma.TransactionClient,
  common: { supplierId: string; voucherNo?: string; receivedBy?: string; note?: string },
  input: MaterialInItemInput,
  inboundNo: string,
) {
  const material = await tx.material.findFirst({
    where: { id: input.materialId, deletedAt: null },
  })
  if (!material) throw new Error('物料不存在或已归档')

  const location = await resolveInventoryLocation(tx, input.locationId)
  const stockQuantity = resolveMaterialInStockQuantity({
    primaryMeasure: material.primaryMeasure,
    qty: input.qty,
    pieceCount: input.pieceCount,
    stockQtyMode: input.stockQtyMode,
    stockQtyInput: input.stockQtyInput,
    totalLength: input.totalLength,
    totalWeight: input.totalWeight,
  })
  const { qty, pieceCount, stockQtyMode, stockQtyInput, totalLength, totalWeight } = stockQuantity
  const units = resolveMaterialUnits(material)
  const stockUnit = input.unit || units.stockUnit
  const materialUsesDualUnit = units.stockUnit !== units.valuationUnit || units.conversionRate !== 1
  const actualReferenceQty = material.referenceMeasure === 'LENGTH'
    ? totalLength
    : material.referenceMeasure === 'WEIGHT'
      ? totalWeight
      : material.referenceMeasure === 'QUANTITY'
        ? pieceCount
        : input.valuationQty
  const effectiveValuationQty = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0
    ? actualReferenceQty
    : toValuationQty(qty, units.conversionRate)
  const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
  const conversionSource = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0
    ? 'DOCUMENT_ACTUAL'
    : 'MASTER_DEFAULT'
  const valuationUnit = materialUsesDualUnit ? input.valuationUnit || units.valuationUnit : stockUnit
  const requestedPriceBasis = input.priceBasis || 'VALUATION'
  const requestedPriceUnit = normalizeMaterialInPriceUnit(
    input.priceUnit || (requestedPriceBasis === 'VALUATION' ? valuationUnit : stockUnit),
    requestedPriceBasis === 'VALUATION' ? material.referenceMeasure || material.primaryMeasure : material.primaryMeasure
  )
  const pricing = resolveMaterialInPricing({
    priceUnit: requestedPriceUnit,
    unitPrice: input.unitPrice,
    totalAmount: input.totalAmount,
    totalLength,
    totalWeight,
    pieceCount,
  })
  const { totalAmount, priceBasis, priceUnit } = pricing
  const valuationUnitCost = effectiveValuationQty > 0 ? Number((totalAmount / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCost = qty > 0 ? Number((totalAmount / qty).toFixed(6)) : 0

  return tx.materialIn.create({
    data: {
      inboundNo,
      voucherNo: common.voucherNo?.trim() || null,
      supplierId: common.supplierId,
      materialId: input.materialId,
      locationId: location.id,
      qty,
      unit: stockUnit,
      pieceCount,
      stockQtyMode,
      stockQtyInput,
      totalLength,
      totalWeight,
      valuationQty: effectiveValuationQty,
      valuationUnit,
      conversionRate,
      conversionSource,
      unitPrice: pricing.unitPrice,
      priceBasis,
      priceUnit,
      valuationUnitCost,
      stockUnitCost,
      totalAmount,
      batchNo: input.batchNo,
      receivedBy: common.receivedBy,
      note: common.note,
      status: 'PENDING',
    },
    include: {
      supplier: true,
      material: true,
      location: true,
    },
  })
}

// GET: 来料单列表，支持 status 筛选和分页
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const keyword = searchParams.get('keyword')?.trim()
    const supplierId = searchParams.get('supplierId')
    const customerId = searchParams.get('customerId')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    const andConditions: any[] = []
    applyStatusFilter(where, statuses)
    if (supplierId) where.supplierId = supplierId
    if (customerId === '__UNASSIGNED__') andConditions.push({ material: { is: { customerId: null } } })
    else if (customerId) andConditions.push({ material: { is: { customerId } } })
    if (keyword) {
      andConditions.push({ OR: [
        { inboundNo: { contains: keyword } },
        { voucherNo: { contains: keyword } },
        { batchNo: { contains: keyword } },
        { receivedBy: { contains: keyword } },
        { note: { contains: keyword } },
        { supplier: { is: { code: { contains: keyword } } } },
        { supplier: { is: { name: { contains: keyword } } } },
        { material: { is: { code: { contains: keyword } } } },
        { material: { is: { name: { contains: keyword } } } },
        { material: { is: { spec: { contains: keyword } } } },
      ] })
    }
    if (andConditions.length > 0) where.AND = andConditions

    const [items, total] = await Promise.all([
      prisma.materialIn.findMany({
        where,
        include: {
          supplier: true,
          location: true,
          material: { include: { customer: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.materialIn.count({ where }),
    ])

    return NextResponse.json({
      data: items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get material-ins error:', error)
    return NextResponse.json({ error: '获取来料单列表失败' }, { status: 500 })
  }
}

// POST: 创建来料单
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'create')
    if (denied) return denied

    const body = await req.json()
    const parsed = createMaterialInSchema.parse(body)
    const { supplierId, voucherNo, receivedBy, note } = parsed
    const requestedItems = 'items' in parsed ? parsed.items : [parsed]

    // 校验供应商存在且未归档
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    })
    if (!supplier) {
      return NextResponse.json({ error: '供应商不存在或已归档' }, { status: 404 })
    }

    // 生成 inboundNo: IN-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const count = await prisma.materialIn.count({
      where: { createdAt: { gte: dayStart } },
    })
    const materialIns = await prisma.$transaction(async (tx) => {
      const created = []
      for (let index = 0; index < requestedItems.length; index += 1) {
        const inboundNo = `IN-${dateStr}-${String(count + index + 1).padStart(3, '0')}`
        created.push(await createMaterialInLine(tx, { supplierId, voucherNo, receivedBy, note }, requestedItems[index], inboundNo))
      }
      return created
    })

    for (const materialIn of materialIns) {
      await writeAuditLog(req, {
        action: 'CREATE',
        entityType: 'MATERIAL_IN',
        entityId: materialIn.id,
        entityLabel: materialIn.inboundNo,
        afterData: materialIn,
      })
    }

    return NextResponse.json({ data: materialIns[0], items: materialIns, count: materialIns.length }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error && /必须|不能为负|必须大于|库位|物料不存在|已归档/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Create material-in error:', error)
    return NextResponse.json({ error: '创建来料单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少来料单 ID' }, { status: 400 })

    const materialIn = await prisma.materialIn.findUnique({ where: { id } })
    if (!materialIn || materialIn.deletedAt) {
      return NextResponse.json({ error: '来料单不存在或已归档' }, { status: 404 })
    }

    const updated = await prisma.materialIn.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'MATERIAL_IN',
      entityId: updated.id,
      entityLabel: updated.inboundNo,
      beforeData: materialIn,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '来料单已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive material-in error:', error)
    return NextResponse.json({ error: '归档来料单失败' }, { status: 500 })
  }
}
