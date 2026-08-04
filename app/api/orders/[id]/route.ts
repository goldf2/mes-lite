import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        product: true,
        targetMaterial: true,
        bom: { select: { id: true, name: true, version: true } },
        picks: {
          include: { material: true },
          orderBy: { createdAt: 'asc' },
        },
        reports: {
          include: { step: true },
          orderBy: { createdAt: 'asc' },
        },
        qcRecords: {
          orderBy: { checkedAt: 'desc' },
        },
        stockIns: true,
        _count: { select: { actuals: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: '生产订单不存在' }, { status: 404 })
    }

    const groupLines = order.groupNo ? await prisma.productionOrder.findMany({
      where: { groupNo: order.groupNo, deletedAt: null },
      include: {
        product: true,
        targetMaterial: true,
        bom: { select: { id: true, name: true, version: true } },
        _count: { select: { actuals: true } },
      },
      orderBy: { lineNo: 'asc' },
    }) : []

    // 计算当前应报工工序
    const route = await prisma.processRoute.findFirst({
      where: { productId: order.productId, isDefault: true },
      include: { steps: { orderBy: { stepNo: 'asc' } } },
    })

    let currentStepId = null
    if (route) {
      for (const step of route.steps) {
        const report = order.reports.find(r => r.stepId === step.id && r.endTime)
        if (!report) {
          currentStepId = step.id
          break
        }
      }
    }

    return NextResponse.json({
      data: {
        ...order,
        groupLines,
        currentStepId,
        routeSteps: route?.steps ?? [],
      },
    })
  } catch (error) {
    console.error('Get order detail error:', error)
    return NextResponse.json({ error: '获取生产订单详情失败' }, { status: 500 })
  }
}
