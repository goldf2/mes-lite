import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'
import { resolveProductId } from '@/lib/material-product'
import { assertInventoryIssueAvailability, resolveInventoryLocation } from '@/lib/inventory'
import { getSalesOrderItemRemainingQty } from '@/lib/sales-orders'

const createShipmentSchema = z.object({
  salesOrderItemId: z.string().min(1, '请选择销售订单明细'),
  locationId: z.string().min(1, '发货库位必填').optional(),
  qty: z.number().finite().positive(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  shippedBy: z.string().optional(),
})

// GET: 发货单列表
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const customer = searchParams.get('customer')
    const keyword = searchParams.get('keyword')?.trim()
    const customerId = searchParams.get('customerId')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    const andConditions: any[] = []
    applyStatusFilter(where, statuses)
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
    if (customer) andConditions.push({ customer: { contains: customer } })
    if (keyword) {
      andConditions.push({ OR: [
        { shipmentNo: { contains: keyword } },
        { voucherNo: { contains: keyword } },
        { customer: { contains: keyword } },
        { customerPhone: { contains: keyword } },
        { address: { contains: keyword } },
        { trackingNo: { contains: keyword } },
        { shippedBy: { contains: keyword } },
        { note: { contains: keyword } },
        { salesOrder: { is: { orderNo: { contains: keyword } } } },
        { product: { is: { sku: { contains: keyword } } } },
        { product: { is: { name: { contains: keyword } } } },
        { customerRef: { is: { code: { contains: keyword } } } },
        { customerRef: { is: { name: { contains: keyword } } } },
      ] })
    }
    if (andConditions.length > 0) where.AND = andConditions

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
          customerRef: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
          salesOrder: { select: { id: true, orderNo: true, voucherNo: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.shipment.count({ where }),
    ])

    return NextResponse.json({
      data: shipments,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get shipments error:', error)
    return NextResponse.json({ error: '获取发货单列表失败' }, { status: 500 })
  }
}

// POST: 创建发货单
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = createShipmentSchema.parse(body)
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const count = await prisma.shipment.count({
      where: { createdAt: { gte: dayStart } },
    })
    const shipmentNo = `SH-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const shipment = await prisma.$transaction(async (tx) => {
      const { item, remainingQty } = await getSalesOrderItemRemainingQty(tx, data.salesOrderItemId)
      if (!['CONFIRMED', 'PARTIAL'].includes(item.salesOrder.status)) {
        throw new Error('销售订单尚未确认或已经结束')
      }
      if (item.salesOrder.customer.deletedAt) throw new Error('销售订单客户已归档')
      if (item.material.deletedAt) throw new Error('销售订单物料已归档')
      if (data.qty > remainingQty + 0.000001) {
        throw new Error(`发货数量超过订单未发数量 ${remainingQty} ${item.unit}`)
      }

      const location = await resolveInventoryLocation(tx, data.locationId)
      await assertInventoryIssueAvailability(tx, {
        materialId: item.materialId,
        stockQty: data.qty,
        locationId: location.id,
      })
      const productId = await resolveProductId(tx, item.materialId, { description: '由销售订单物料自动映射，用于发货兼容。' })
      return tx.shipment.create({
        data: {
          shipmentNo,
          voucherNo: item.salesOrder.voucherNo,
          productId,
          materialId: item.materialId,
          locationId: location.id,
          customerId: item.salesOrder.customerId,
          salesOrderId: item.salesOrderId,
          salesOrderItemId: item.id,
          qty: data.qty,
          unitPrice: item.unitPrice,
          totalAmount: data.qty * Number(item.unitPrice),
          customer: item.salesOrder.customer.name,
          customerPhone: item.salesOrder.customer.phone,
          address: item.salesOrder.customer.address,
          trackingNo: data.trackingNo?.trim() || null,
          note: data.note?.trim() || null,
          shippedBy: data.shippedBy?.trim() || null,
          status: 'PENDING',
        },
        include: {
          product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
          customerRef: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
          salesOrder: { select: { id: true, orderNo: true, voucherNo: true } },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'SHIPMENT',
      entityId: shipment.id,
      entityLabel: shipment.shipmentNo,
      afterData: shipment,
    })

    return NextResponse.json({ data: shipment }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error && /物料|库存|库位|出库数量|归档|关联|销售订单|发货数量/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Create shipment error:', error)
    return NextResponse.json({ error: '创建发货单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少发货单 ID' }, { status: 400 })
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } })
    if (!shipment || shipment.deletedAt) {
      return NextResponse.json({ error: '发货单不存在或已归档' }, { status: 404 })
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'SHIPMENT',
      entityId: updated.id,
      entityLabel: updated.shipmentNo,
      beforeData: shipment,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '发货单已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive shipment error:', error)
    return NextResponse.json({ error: '归档发货单失败' }, { status: 500 })
  }
}
