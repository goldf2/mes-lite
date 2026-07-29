import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'

const createMaterialInSchema = z.object({
  clientRequestId: z.string().min(8).optional(),
  voucherNo: z.string().optional(),
  supplierId: z.string().min(1, '供应商必填'),
  materialId: z.string().min(1, '物料必填'),
  qty: z.number().positive('数量必须大于 0'),
  unit: z.string().optional(),
  valuationQty: z.number().nonnegative('核算数量不能为负').optional(),
  valuationUnit: z.string().optional(),
  unitPrice: z.number().nonnegative('单价不能为负'),
  priceBasis: z.enum(['VALUATION', 'STOCK']).optional(),
  batchNo: z.string().optional(),
  receivedBy: z.string().optional(),
  note: z.string().optional(),
  profileLines: z.array(z.object({
    clientLineId: z.string().min(8).optional(),
    actualLengthMm: z.number().positive('实际长度必须大于 0'),
    quantity: z.number().int().positive('根数必须为正整数').max(10000),
    trackingMode: z.enum(['BATCH', 'SINGLE']).default('BATCH'),
    totalWeightKg: z.number().nonnegative('实测重量不能为负').optional(),
    location: z.string().trim().optional(),
    note: z.string().trim().optional(),
  })).max(200).optional(),
})

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
          material: { include: { customer: { select: { id: true, code: true, name: true } }, profileSpec: true } },
          profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
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
    const { clientRequestId, supplierId, materialId, qty, valuationQty, unitPrice, batchNo, receivedBy, note, voucherNo, profileLines } =
      createMaterialInSchema.parse(body)

    if (clientRequestId) {
      const existingRequest = await prisma.materialIn.findUnique({
        where: { clientRequestId },
        include: { supplier: true, material: true, profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      })
      if (existingRequest) return NextResponse.json({ data: existingRequest, duplicate: true })
    }

    // 校验供应商存在且未归档
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    })
    if (!supplier) {
      return NextResponse.json({ error: '供应商不存在或已归档' }, { status: 404 })
    }

    // 校验物料存在且未归档
    const material = await prisma.material.findFirst({
      where: { id: materialId, deletedAt: null },
      include: { profileSpec: true },
    })
    if (!material) {
      return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })
    }
    if (profileLines?.length && !material.profileSpec) {
      return NextResponse.json({ error: '该物料尚未启用型材实体追踪，请先维护型材规格' }, { status: 400 })
    }
    if (profileLines?.length) {
      const profileQty = profileLines.reduce((sum, line) => sum + line.quantity, 0)
      if (Math.abs(profileQty - qty) > 0.000001) {
        return NextResponse.json({ error: '来料数量必须等于所有实测长度行的根数合计' }, { status: 400 })
      }
    }
    const units = resolveMaterialUnits(material)
    const stockUnit = body.unit || units.stockUnit
    const materialUsesDualUnit = units.stockUnit !== units.valuationUnit || units.conversionRate !== 1
    const effectiveValuationQty = materialUsesDualUnit && valuationQty && valuationQty > 0
      ? valuationQty
      : toValuationQty(qty, units.conversionRate)
    const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
    const conversionSource = materialUsesDualUnit && valuationQty && valuationQty > 0
      ? 'DOCUMENT_ACTUAL'
      : 'MASTER_DEFAULT'
    const valuationUnit = materialUsesDualUnit ? body.valuationUnit || units.valuationUnit : stockUnit
    const requestedPriceBasis = body.priceBasis || 'VALUATION'
    const priceBasis = materialUsesDualUnit ? requestedPriceBasis : 'STOCK'
    const priceUnit = priceBasis === 'STOCK' ? stockUnit : valuationUnit

    // 生成 inboundNo: IN-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.materialIn.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const inboundNo = `IN-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const totalAmount = priceBasis === 'STOCK'
      ? Number((qty * unitPrice).toFixed(6))
      : Number((effectiveValuationQty * unitPrice).toFixed(6))
    const valuationUnitCost = effectiveValuationQty > 0 ? Number((totalAmount / effectiveValuationQty).toFixed(6)) : 0
    const stockUnitCost = qty > 0 ? Number((totalAmount / qty).toFixed(6)) : 0

    const materialIn = await prisma.$transaction((tx) => tx.materialIn.create({
      data: {
        clientRequestId: clientRequestId || null,
        inboundNo,
        voucherNo: voucherNo?.trim() || null,
        supplierId,
        materialId,
        qty,
        unit: stockUnit,
        valuationQty: effectiveValuationQty,
        valuationUnit,
        conversionRate,
        conversionSource,
        unitPrice,
        priceBasis,
        priceUnit,
        valuationUnitCost,
        stockUnitCost,
        totalAmount,
        batchNo,
        receivedBy,
        note,
        status: 'PENDING',
        profileLines: profileLines?.length ? {
          create: profileLines.map((line, index) => ({
            clientLineId: line.clientLineId || null,
            actualLengthMm: line.actualLengthMm,
            quantity: line.quantity,
            trackingMode: line.trackingMode,
            sortOrder: index,
            totalWeightKg: line.totalWeightKg ?? null,
            location: line.location || null,
            note: line.note || null,
          })),
        } : undefined,
      },
      include: {
        supplier: true,
        material: true,
        profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    }))

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'MATERIAL_IN',
      entityId: materialIn.id,
      entityLabel: materialIn.inboundNo,
      afterData: materialIn,
    })

    return NextResponse.json({ data: materialIn }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
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
