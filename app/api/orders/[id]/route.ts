import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        product: true,
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
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

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
        currentStepId,
        routeSteps: route?.steps ?? [],
      },
    })
  } catch (error) {
    console.error('Get order detail error:', error)
    return NextResponse.json({ error: '获取工单详情失败' }, { status: 500 })
  }
}
