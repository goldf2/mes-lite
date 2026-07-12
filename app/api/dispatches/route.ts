import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

const createDispatchSchema = z.object({
  orderId: z.string().min(1),
  stepId: z.string().min(1),
  workerName: z.string().min(1),
  workerId: z.string().optional(),
  planQty: z.number().int().positive(),
  priority: z.string().optional(),
  note: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const workerName = searchParams.get('workerName')
    const orderId = searchParams.get('orderId')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = { deletedAt: null }
    if (status) where.status = status
    if (workerName) where.workerName = { contains: workerName }
    if (orderId) where.orderId = orderId

    const [dispatches, total] = await Promise.all([
      prisma.dispatch.findMany({
        where,
        include: {
          order: {
            include: { product: { select: { id: true, name: true, sku: true } } },
          },
          step: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dispatch.count({ where }),
    ])

    return NextResponse.json({
      data: dispatches,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get dispatches error:', error)
    return NextResponse.json({ error: '获取派工单列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = createDispatchSchema.parse(body)

    const order = await prisma.productionOrder.findUnique({
      where: { id: data.orderId },
      include: {
        product: {
          include: {
            processRoutes: { include: { steps: true } },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    if (order.status !== 'PICKED' && order.status !== 'RUNNING') {
      return NextResponse.json(
        { error: '工单状态不允许派工，需为 PICKED 或 RUNNING' },
        { status: 400 }
      )
    }

    // 校验工序属于该工单产品的工艺路线
    const stepIds = order.product.processRoutes.flatMap((r) =>
      r.steps.map((s) => s.id)
    )
    if (!stepIds.includes(data.stepId)) {
      return NextResponse.json(
        { error: '工序不属于该工单产品的工艺路线' },
        { status: 400 }
      )
    }

    // 生成派工单号 DP-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.dispatch.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const dispatchNo = `DP-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const dispatch = await prisma.dispatch.create({
      data: {
        dispatchNo,
        orderId: data.orderId,
        stepId: data.stepId,
        workerName: data.workerName,
        workerId: data.workerId,
        planQty: data.planQty,
        priority: data.priority ?? 'NORMAL',
        status: 'PENDING',
        note: data.note,
      },
      include: {
        order: { include: { product: true } },
        step: true,
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'DISPATCH',
      entityId: dispatch.id,
      entityLabel: dispatch.dispatchNo,
      afterData: dispatch,
    })

    return NextResponse.json({ data: dispatch }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create dispatch error:', error)
    return NextResponse.json({ error: '创建派工单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少派工单 ID' }, { status: 400 })

    const dispatch = await prisma.dispatch.findUnique({ where: { id } })
    if (!dispatch || dispatch.deletedAt) {
      return NextResponse.json({ error: '派工单不存在或已删除' }, { status: 404 })
    }

    const updated = await prisma.dispatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'DISPATCH',
      entityId: updated.id,
      entityLabel: updated.dispatchNo,
      beforeData: dispatch,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '派工单已删除，可在回收站恢复' })
  } catch (error) {
    console.error('Delete dispatch error:', error)
    return NextResponse.json({ error: '删除派工单失败' }, { status: 500 })
  }
}
