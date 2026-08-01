import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'
import { materialInPriceUnits, normalizeMaterialInPriceUnit, resolveMaterialInPricing, resolveMaterialInStockQuantity } from '@/lib/material-in-quantity'

const updateMaterialInSchema = z.object({
  voucherNo: z.string().optional(),
  supplierId: z.string().min(1, '供应商必填'),
  materialId: z.string().min(1, '物料必填'),
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
  receivedBy: z.string().optional(),
  note: z.string().optional(),
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
        material: true,
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
    const { supplierId, materialId, valuationQty, unitPrice, batchNo, receivedBy, note, voucherNo } =
      updateMaterialInSchema.parse(body)

    const current = await prisma.materialIn.findUnique({
      where: { id: params.id },
      include: { supplier: true, material: true },
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
    })
    if (!material) {
      return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })
    }
    const stockQuantity = resolveMaterialInStockQuantity({
      primaryMeasure: material.primaryMeasure,
      qty: body.qty,
      pieceCount: body.pieceCount,
      stockQtyMode: body.stockQtyMode,
      stockQtyInput: body.stockQtyInput,
      totalLength: body.totalLength,
      totalWeight: body.totalWeight,
    })
    const { qty, pieceCount, stockQtyMode, stockQtyInput, totalLength, totalWeight } = stockQuantity

    const units = resolveMaterialUnits(material)
    const stockUnit = body.unit || units.stockUnit
    const materialUsesDualUnit = units.stockUnit !== units.valuationUnit || units.conversionRate !== 1
    const valuationUnit = materialUsesDualUnit ? body.valuationUnit || units.valuationUnit : stockUnit
    const actualReferenceQty = material.referenceMeasure === 'LENGTH'
      ? totalLength
      : material.referenceMeasure === 'WEIGHT'
        ? totalWeight
        : material.referenceMeasure === 'QUANTITY'
          ? pieceCount
          : valuationQty
    const effectiveValuationQty = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0
      ? actualReferenceQty
      : toValuationQty(qty, units.conversionRate)
    const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
    const conversionSource = materialUsesDualUnit && actualReferenceQty && actualReferenceQty > 0
      ? 'DOCUMENT_ACTUAL'
      : 'MASTER_DEFAULT'
    const requestedPriceBasis = body.priceBasis || 'VALUATION'
    const requestedPriceUnit = normalizeMaterialInPriceUnit(
      body.priceUnit || (requestedPriceBasis === 'VALUATION' ? valuationUnit : stockUnit),
      requestedPriceBasis === 'VALUATION' ? material.referenceMeasure || material.primaryMeasure : material.primaryMeasure
    )
    const pricing = resolveMaterialInPricing({
      priceUnit: requestedPriceUnit,
      unitPrice,
      totalAmount: body.totalAmount,
      totalLength,
      totalWeight,
      pieceCount,
    })
    const { totalAmount, priceBasis, priceUnit } = pricing
    const valuationUnitCost = Number((totalAmount / effectiveValuationQty).toFixed(6))
    const stockUnitCost = Number((totalAmount / qty).toFixed(6))

    const updated = await prisma.materialIn.update({
      where: { id: params.id },
      data: {
        supplierId,
        voucherNo: voucherNo?.trim() || null,
        materialId,
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
        batchNo: batchNo || null,
        receivedBy: receivedBy || null,
        note: note || null,
      },
      include: {
        supplier: true,
        material: true,
      },
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
    if (error instanceof Error && /必须|不能为负|必须大于/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Update material-in error:', error)
    return NextResponse.json({ error: '修改来料单失败' }, { status: 500 })
  }
}
