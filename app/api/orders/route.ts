import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { applyStatusFilter, parseStatusFilter } from '@/lib/status-filter'
import { ensureProductForMaterial, isMaterialProductId, materialProductPrefix } from '@/lib/material-product'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

const orderLineSchema = z.object({
  targetId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1, '请选择 BOM 方案'),
  planQty: z.number().finite().positive('计划数量必须大于 0'),
})

const createOrderSchema = z.object({
  voucherNo: z.string().optional(),
  targetType: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  targetId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  materialId: z.string().min(1).optional(),
  bomId: z.string().min(1).optional(),
  planQty: z.number().finite().positive().optional(),
  items: z.array(orderLineSchema).min(1, '请至少添加一个产品').max(50, '单张生产订单最多添加 50 个产品').optional(),
  note: z.string().optional(),
}).superRefine((value, context) => {
  if (value.items?.length) return
  if (!(value.targetId || value.materialId || value.productId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '请选择物料', path: ['targetId'] })
  }
  if (!value.bomId) context.addIssue({ code: z.ZodIssueCode.custom, message: '请选择 BOM 方案', path: ['bomId'] })
  if (!value.planQty) context.addIssue({ code: z.ZodIssueCode.custom, message: '计划数量必须大于 0', path: ['planQty'] })
})

async function resolveOrderLine(tx: Prisma.TransactionClient, input: z.infer<typeof orderLineSchema>) {
  const rawTargetId = input.targetId
  const targetId = isMaterialProductId(rawTargetId) ? rawTargetId.slice(materialProductPrefix.length) : rawTargetId
  const material = await tx.material.findUnique({
    where: { id: targetId },
    select: { id: true, code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true, deletedAt: true },
  })
  if (!material || material.deletedAt) throw new Error('物料不存在或已归档')

  const productId = await ensureProductForMaterial(tx, material, {
    defaultRoute: true,
    description: `由物料 ${material.code} 自动映射，用于简易生产工单。`,
  })
  const bom = await tx.bOM.findFirst({
    where: { id: input.bomId, productId, isActive: true },
    select: {
      id: true,
      name: true,
      version: true,
      outputQuantity: true,
      outputUnit: true,
      outputs: {
        orderBy: { isPrimary: 'desc' },
        select: {
          id: true,
          materialId: true,
          quantity: true,
          unit: true,
          isPrimary: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
      items: {
        where: { itemType: 'MATERIAL', materialId: { not: null } },
        select: {
          id: true,
          materialId: true,
          outputMaterialId: true,
          quantity: true,
          unit: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
    },
  })
  if (!bom || bom.outputs.length === 0 || bom.items.length === 0) {
    throw new Error(`物料 ${material.code} 的 BOM 不存在、已停用或缺少投入/产出明细`)
  }
  if (bom.outputs.filter((output) => output.isPrimary).length !== 1) {
    throw new Error(`物料 ${material.code} 的 BOM 必须且只能有一项主产出`)
  }
  return { material, productId, bom, planQty: input.planQty }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied

    const body = await req.json()
    const parsed = createOrderSchema.parse(body)
    const legacyTargetId = parsed.targetId ?? parsed.materialId ?? parsed.productId
    const requestedLines = parsed.items || [{
      targetId: legacyTargetId!,
      bomId: parsed.bomId!,
      planQty: parsed.planQty!,
    }]

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const count = await prisma.productionOrder.count({
      where: { createdAt: { gte: dayStart } },
    })
    const groupNo = `WO-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const orders = await prisma.$transaction(async (tx) => {
      const resolvedLines = []
      for (const line of requestedLines) resolvedLines.push(await resolveOrderLine(tx, line))

      const created = []
      for (let index = 0; index < resolvedLines.length; index += 1) {
        const line = resolvedLines[index]
        const orderNo = index === 0 ? groupNo : `${groupNo}-${String(index + 1).padStart(2, '0')}`
        created.push(await tx.productionOrder.create({
          data: {
            orderNo,
            groupNo: resolvedLines.length > 1 ? groupNo : null,
            lineNo: index + 1,
            voucherNo: parsed.voucherNo?.trim() || null,
            productId: line.productId,
            materialId: line.material.id,
            bomId: line.bom.id,
            bomName: line.bom.name,
            bomVersion: line.bom.version,
            bomSnapshot: JSON.stringify(line.bom),
            planQty: line.planQty,
            status: 'DRAFT',
            note: parsed.note,
          },
        }))
      }
      return created
    })

    return NextResponse.json({
      data: orders[0],
      items: orders,
      count: orders.length,
      groupNo: orders.length > 1 ? groupNo : null,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error && /物料|BOM|计划/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Create order error:', error)
    return NextResponse.json({ error: '创建生产订单失败' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
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
        { product: { is: { customerId: null } } },
        { targetMaterial: { is: { customerId: null } } },
      ] })
    } else if (customerId) {
      andConditions.push({ OR: [
        { product: { is: { customerId } } },
        { targetMaterial: { is: { customerId } } },
      ] })
    }
    andConditions.push(...tokenizeKeywordQuery(keyword || '').map((token) => ({ OR: [
      { orderNo: { contains: token } },
      { groupNo: { contains: token } },
      { voucherNo: { contains: token } },
      { product: { is: { sku: { contains: token } } } },
      { product: { is: { name: { contains: token } } } },
      { targetMaterial: { is: { code: { contains: token } } } },
      { targetMaterial: { is: { name: { contains: token } } } },
      { targetMaterial: { is: { spec: { contains: token } } } },
    ] })))
    if (andConditions.length > 0) where.AND = andConditions

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, customerId: true, customer: { select: { id: true, code: true, name: true } } } },
          targetMaterial: { select: { id: true, name: true, code: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, valuationUnit: true } },
          bom: { select: { id: true, name: true, version: true } },
          _count: { select: { reports: true, picks: true, actuals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productionOrder.count({ where }),
    ])

    return NextResponse.json({
      data: orders,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: '获取生产订单列表失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少生产订单 ID' }, { status: 400 })

    const order = await prisma.productionOrder.findUnique({ where: { id } })
    if (!order || order.deletedAt) {
      return NextResponse.json({ error: '生产订单不存在或已归档' }, { status: 404 })
    }

    const updated = await prisma.productionOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'ORDER',
      entityId: updated.id,
      entityLabel: updated.orderNo,
      beforeData: order,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '生产订单已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive order error:', error)
    return NextResponse.json({ error: '归档生产订单失败' }, { status: 500 })
  }
}
