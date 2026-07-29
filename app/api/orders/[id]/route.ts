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

    // 新工单固定使用创建时工艺快照；旧工单没有快照时才兼容读取当前默认路线。
    let routeSteps: Array<{
      id: string
      stepNo: number
      name: string
      workstation: string | null
      [key: string]: unknown
    }> = []
    if (order.processSnapshot) {
      try {
        const snapshot = JSON.parse(order.processSnapshot)
        routeSteps = Array.isArray(snapshot?.steps) ? snapshot.steps : []
      } catch {
        return NextResponse.json({ error: '工单工艺快照损坏' }, { status: 409 })
      }
    } else {
      const route = await prisma.processRoute.findFirst({
        where: { productId: order.productId, isDefault: true },
        include: { steps: { orderBy: { stepNo: 'asc' } } },
      })
      routeSteps = route?.steps ?? []
    }

    let currentStepId = null
    for (const step of routeSteps) {
      const report = order.reports.find(r => r.stepId === step.id && r.endTime)
      if (!report) {
        currentStepId = step.id
        break
      }
    }

    return NextResponse.json({
      data: {
        ...order,
        currentStepId,
        routeSteps,
      },
    })
  } catch (error) {
    console.error('Get order detail error:', error)
    return NextResponse.json({ error: '获取工单详情失败' }, { status: 500 })
  }
}
