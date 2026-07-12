import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits } from '@/lib/units'

const createMaterialInSchema = z.object({
  supplierId: z.string().min(1, '供应商必填'),
  materialId: z.string().min(1, '物料必填'),
  qty: z.number().positive('数量必须大于 0'),
  unit: z.string().optional(),
  valuationQty: z.number().positive('实际重量必须大于 0'),
  valuationUnit: z.string().optional(),
  unitPrice: z.number().nonnegative('单价不能为负'),
  batchNo: z.string().optional(),
  receivedBy: z.string().optional(),
  note: z.string().optional(),
})

// GET: 来料单列表，支持 status 筛选和分页
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    if (status) where.status = status

    const [items, total] = await Promise.all([
      prisma.materialIn.findMany({
        where,
        include: {
          supplier: true,
          material: true,
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
    const { supplierId, materialId, qty, valuationQty, unitPrice, batchNo, receivedBy, note } =
      createMaterialInSchema.parse(body)

    // 校验供应商存在且未删除
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    })
    if (!supplier) {
      return NextResponse.json({ error: '供应商不存在或已删除' }, { status: 404 })
    }

    // 校验物料存在且未删除
    const material = await prisma.material.findFirst({
      where: { id: materialId, deletedAt: null },
    })
    if (!material) {
      return NextResponse.json({ error: '物料不存在或已删除' }, { status: 404 })
    }
    const units = resolveMaterialUnits(material)
    const conversionRate = Number((valuationQty / qty).toFixed(6))
    const stockUnit = body.unit || units.stockUnit
    const valuationUnit = body.valuationUnit || units.valuationUnit

    // 生成 inboundNo: IN-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.materialIn.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const inboundNo = `IN-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const totalAmount = valuationQty * unitPrice
    const stockUnitCost = qty > 0 ? totalAmount / qty : 0

    const materialIn = await prisma.materialIn.create({
      data: {
        inboundNo,
        supplierId,
        materialId,
        qty,
        unit: stockUnit,
        valuationQty,
        valuationUnit,
        conversionRate,
        unitPrice,
        stockUnitCost,
        totalAmount,
        batchNo,
        receivedBy,
        note,
        status: 'PENDING',
      },
      include: {
        supplier: true,
        material: true,
      },
    })

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
      return NextResponse.json({ error: '来料单不存在或已删除' }, { status: 404 })
    }

    const updated = await prisma.materialIn.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'MATERIAL_IN',
      entityId: updated.id,
      entityLabel: updated.inboundNo,
      beforeData: materialIn,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '来料单已删除，可在回收站恢复' })
  } catch (error) {
    console.error('Delete material-in error:', error)
    return NextResponse.json({ error: '删除来料单失败' }, { status: 500 })
  }
}
