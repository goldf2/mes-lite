import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'

export const dynamic = 'force-dynamic'

const salesOrderLineSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  qty: z.number().finite().positive('销售数量必须大于 0'),
  unitPrice: z.number().finite().nonnegative('单价不能小于 0'),
  note: z.string().optional(),
})

const createSalesOrderSchema = z.object({
  voucherNo: z.string().optional(),
  customerId: z.string().min(1, '请选择客户'),
  orderDate: z.string().min(1, '请选择订单日期'),
  deliveryDate: z.string().optional(),
  note: z.string().optional(),
  items: z.array(salesOrderLineSchema).min(1, '请至少添加一个销售物料').max(50, '一张销售订单最多添加 50 项物料'),
})

function parseDate(value: string, field: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error(`${field}格式不正确`)
  return date
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const keyword = searchParams.get('keyword')?.trim()
    const customerId = searchParams.get('customerId')
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 30)))
    const where: any = { deletedAt: null }
    applyStatusFilter(where, statuses)
    if (customerId) where.customerId = customerId
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { voucherNo: { contains: keyword } },
        { note: { contains: keyword } },
        { customer: { is: { name: { contains: keyword } } } },
        { items: { some: { material: { is: { code: { contains: keyword } } } } } },
        { items: { some: { material: { is: { name: { contains: keyword } } } } } },
        { items: { some: { material: { is: { spec: { contains: keyword } } } } } },
      ]
    }

    const [orders, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, name: true, phone: true, address: true } },
          items: {
            orderBy: { createdAt: 'asc' },
            include: {
              material: { select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true } },
              shipments: {
                where: { status: 'PENDING', deletedAt: null },
                select: { qty: true },
              },
            },
          },
          _count: { select: { shipments: true } },
        },
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.salesOrder.count({ where }),
    ])

    const data = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => {
        const pendingQty = item.shipments.reduce((sum, shipment) => sum + Number(shipment.qty), 0)
        const { shipments, ...rest } = item
        return {
          ...rest,
          pendingQty,
          remainingQty: Math.max(0, Number((Number(item.qty) - Number(item.shippedQty) - pendingQty).toFixed(6))),
        }
      }),
    }))
    return NextResponse.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } })
  } catch (error) {
    console.error('Get sales orders error:', error)
    return NextResponse.json({ error: '获取销售订单失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'create')
    if (denied) return denied

    const input = createSalesOrderSchema.parse(await req.json())
    const materialIds = input.items.map((item) => item.materialId)
    if (new Set(materialIds).size !== materialIds.length) {
      return NextResponse.json({ error: '同一物料请合并为一条销售明细' }, { status: 400 })
    }

    const [customer, materials] = await Promise.all([
      prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } }),
      prisma.material.findMany({ where: { id: { in: materialIds }, deletedAt: null } }),
    ])
    if (!customer) return NextResponse.json({ error: '客户不存在或已归档' }, { status: 400 })
    if (materials.length !== materialIds.length) return NextResponse.json({ error: '部分物料不存在或已归档' }, { status: 400 })

    const materialById = new Map(materials.map((material) => [material.id, material]))
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const count = await prisma.salesOrder.count({ where: { createdAt: { gte: dayStart } } })
    const orderNo = `SO-${dateStr}-${String(count + 1).padStart(3, '0')}`
    const totalAmount = input.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)

    const order = await prisma.salesOrder.create({
      data: {
        orderNo,
        voucherNo: input.voucherNo?.trim() || null,
        customerId: customer.id,
        orderDate: parseDate(input.orderDate, '订单日期'),
        deliveryDate: input.deliveryDate ? parseDate(input.deliveryDate, '交付日期') : null,
        totalAmount,
        note: input.note?.trim() || null,
        items: {
          create: input.items.map((item) => {
            const material = materialById.get(item.materialId)!
            return {
              materialId: material.id,
              qty: item.qty,
              unit: material.stockUnit || material.unit,
              unitPrice: item.unitPrice,
              totalAmount: item.qty * item.unitPrice,
              note: item.note?.trim() || null,
            }
          }),
        },
      },
      include: { customer: true, items: { include: { material: true } } },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'SALES_ORDER',
      entityId: order.id,
      entityLabel: order.orderNo,
      afterData: order,
    })
    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof Error && /日期/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Create sales order error:', error)
    return NextResponse.json({ error: '创建销售订单失败' }, { status: 500 })
  }
}
