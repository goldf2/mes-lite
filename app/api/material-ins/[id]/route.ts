import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'

const updateMaterialInSchema = z.object({
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

// GET: 来料单详情
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied

    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({
      where: { id },
      include: {
        supplier: true,
        material: { include: { profileSpec: true } },
        profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: materialIn })
  } catch (error) {
    console.error('Get material-in error:', error)
    return NextResponse.json({ error: '获取来料单详情失败' }, { status: 500 })
  }
}

// PATCH: 修改待收货来料单
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied

    const body = await req.json()
    const { supplierId, materialId, qty, valuationQty, unitPrice, batchNo, receivedBy, note, voucherNo, profileLines } =
      updateMaterialInSchema.parse(body)

    const current = await prisma.materialIn.findUnique({
      where: { id: params.id },
      include: { supplier: true, material: true, profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    })

    if (!current || current.deletedAt) {
      return NextResponse.json({ error: '来料单不存在或已归档' }, { status: 404 })
    }

    if (current.status !== 'PENDING') {
      return NextResponse.json({ error: '只有待收货来料单可以修改' }, { status: 400 })
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    })
    if (!supplier) {
      return NextResponse.json({ error: '供应商不存在或已归档' }, { status: 404 })
    }

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
    const valuationUnit = materialUsesDualUnit ? body.valuationUnit || units.valuationUnit : stockUnit
    const effectiveValuationQty = materialUsesDualUnit && valuationQty && valuationQty > 0
      ? valuationQty
      : toValuationQty(qty, units.conversionRate)
    const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
    const conversionSource = materialUsesDualUnit && valuationQty && valuationQty > 0
      ? 'DOCUMENT_ACTUAL'
      : 'MASTER_DEFAULT'
    const requestedPriceBasis = body.priceBasis || 'VALUATION'
    const priceBasis = materialUsesDualUnit ? requestedPriceBasis : 'STOCK'
    const priceUnit = priceBasis === 'STOCK' ? stockUnit : valuationUnit
    const totalAmount = priceBasis === 'STOCK'
      ? Number((qty * unitPrice).toFixed(6))
      : Number((effectiveValuationQty * unitPrice).toFixed(6))
    const valuationUnitCost = Number((totalAmount / effectiveValuationQty).toFixed(6))
    const stockUnitCost = Number((totalAmount / qty).toFixed(6))

    const updated = await prisma.$transaction(async (tx) => {
      if (profileLines !== undefined) {
        await tx.materialInProfileLine.deleteMany({ where: { materialInId: params.id } })
      }
      return tx.materialIn.update({
        where: { id: params.id },
        data: {
          supplierId,
          voucherNo: voucherNo?.trim() || null,
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
          batchNo: batchNo || null,
          receivedBy: receivedBy || null,
          note: note || null,
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
      })
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'MATERIAL_IN',
      entityId: updated.id,
      entityLabel: updated.inboundNo,
      beforeData: current,
      afterData: updated,
    })

    return NextResponse.json({ data: updated, message: '来料单已修改' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update material-in error:', error)
    return NextResponse.json({ error: '修改来料单失败' }, { status: 500 })
  }
}
