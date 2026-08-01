import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'
import { resolveMaterialIdForProduct, resolveProductId } from '@/lib/material-product'
import { resolveInventoryLocation } from '@/lib/inventory'

const createReturnSchema = z.object({
  voucherNo: z.string().optional(),
  shipmentId: z.string().min(1).optional(),
  productId: z.string().min(1),
  locationId: z.string().min(1, '退回库位必填'),
  qty: z.number().finite().positive(),
  reason: z.string().min(1, '退货原因必填'),
  note: z.string().optional(),
})

// POST: 创建退货单
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'create')
    if (denied) return denied

    const body = await req.json()
    const { shipmentId, productId, locationId, qty, reason, note, voucherNo } = createReturnSchema.parse(body)
    const requestedLocationId = locationId

    const resolved = await prisma.$transaction(async (tx) => {
      const materialId = await resolveMaterialIdForProduct(tx, productId)
      const resolvedProductId = await resolveProductId(tx, productId, { description: '由物料自动映射，用于退货兼容。' })
      return { resolvedProductId, materialId }
    })
    const { resolvedProductId, materialId } = resolved
    const product = await prisma.product.findUnique({ where: { id: resolvedProductId } })

    if (!product) {
      return NextResponse.json({ error: '物料不存在' }, { status: 404 })
    }

    if (shipmentId) {
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      })
      if (!shipment) {
        return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
      }
      if (shipment.status !== 'SHIPPED' && shipment.status !== 'DELIVERED') {
        return NextResponse.json({ error: '只有已发货或已签收单据可以退货' }, { status: 400 })
      }
      const shipmentMaterialId = await resolveMaterialIdForProduct(prisma, shipment.productId, shipment.materialId)
      if (!shipmentMaterialId || shipmentMaterialId !== materialId) {
        return NextResponse.json({ error: '退货物料必须与原发货单一致' }, { status: 400 })
      }
      const returned = await prisma.returnOrder.aggregate({
        where: {
          shipmentId,
          deletedAt: null,
          status: { in: ['PENDING', 'PROCESSED'] },
        },
        _sum: { qty: true },
      })
      const remainingQty = Number((Number(shipment.qty) - Number(returned._sum.qty || 0)).toFixed(6))
      if (qty > remainingQty + 0.000001) {
        return NextResponse.json({ error: `退货数量超过原发货可退数量 ${remainingQty}` }, { status: 400 })
      }
    }
    const location = await resolveInventoryLocation(prisma, requestedLocationId)

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.returnOrder.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const returnNo = `RT-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const returnOrder = await prisma.returnOrder.create({
      data: {
        returnNo,
        voucherNo: voucherNo?.trim() || null,
        shipmentId: shipmentId ?? null,
        productId: resolvedProductId,
        materialId,
        locationId: location.id,
        qty,
        reason,
        note,
        status: 'PENDING',
      },
      include: {
        product: true,
        shipment: true,
        location: true,
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'RETURN',
      entityId: returnOrder.id,
      entityLabel: returnOrder.returnNo,
      afterData: returnOrder,
    })

    return NextResponse.json({ data: returnOrder }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create return error:', error)
    return NextResponse.json({ error: '创建退货单失败' }, { status: 500 })
  }
}

// GET: 退货单列表
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const keyword = searchParams.get('keyword')?.trim()
    const customerId = searchParams.get('customerId')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    const andConditions: any[] = []
    applyStatusFilter(where, statuses)
    if (customerId === '__UNASSIGNED__') {
      andConditions.push({ OR: [
        { shipment: { is: { customerId: null } } },
        { shipmentId: null, product: { is: { customerId: null } } },
      ] })
    } else if (customerId) {
      andConditions.push({ OR: [
        { shipment: { is: { customerId } } },
        { shipmentId: null, product: { is: { customerId } } },
      ] })
    }
    if (keyword) {
      andConditions.push({ OR: [
        { returnNo: { contains: keyword } },
        { voucherNo: { contains: keyword } },
        { reason: { contains: keyword } },
        { note: { contains: keyword } },
        { product: { is: { sku: { contains: keyword } } } },
        { product: { is: { name: { contains: keyword } } } },
        { product: { is: { customer: { is: { code: { contains: keyword } } } } } },
        { product: { is: { customer: { is: { name: { contains: keyword } } } } } },
        { shipment: { is: { shipmentNo: { contains: keyword } } } },
        { shipment: { is: { voucherNo: { contains: keyword } } } },
        { shipment: { is: { customer: { contains: keyword } } } },
      ] })
    }
    if (andConditions.length > 0) where.AND = andConditions

    const [returns, total] = await Promise.all([
      prisma.returnOrder.findMany({
        where,
        include: {
          product: { include: { customer: { select: { id: true, code: true, name: true } } } },
          shipment: { include: { customerRef: { select: { id: true, code: true, name: true } } } },
          location: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.returnOrder.count({ where }),
    ])

    return NextResponse.json({
      data: returns,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get returns error:', error)
    return NextResponse.json({ error: '获取退货单列表失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少退货单 ID' }, { status: 400 })

    const returnOrder = await prisma.returnOrder.findUnique({ where: { id } })
    if (!returnOrder || returnOrder.deletedAt) {
      return NextResponse.json({ error: '退货单不存在或已归档' }, { status: 404 })
    }

    const updated = await prisma.returnOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'RETURN',
      entityId: updated.id,
      entityLabel: updated.returnNo,
      beforeData: returnOrder,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '退货单已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive return error:', error)
    return NextResponse.json({ error: '归档退货单失败' }, { status: 500 })
  }
}
