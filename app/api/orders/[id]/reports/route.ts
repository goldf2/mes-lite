import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const reportSchema = z.object({
  stepId: z.string().min(1),
  workerName: z.string().min(1),
  workerId: z.string().optional(),
  goodQty: z.number().int().min(0),
  badQty: z.number().int().min(0),
  badReason: z.string().optional(),
  remark: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { stepId, workerName, workerId, goodQty, badQty, badReason, remark, photoUrls } =
      reportSchema.parse(body)

    const orderId = params.id

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        product: { include: { processRoutes: { include: { steps: true } } } },
        reports: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    // 1. 状态校验：必须 RUNNING 或 PICKED
    if (!['RUNNING', 'PICKED'].includes(order.status)) {
      return NextResponse.json(
        { error: `工单状态为 ${order.status}，不可报工` },
        { status: 400 }
      )
    }

    // 2. 获取工艺路线
    const route = order.product.processRoutes[0]
    if (!route) {
      return NextResponse.json({ error: '产品无工艺路线' }, { status: 400 })
    }

    const steps = route.steps.sort((a, b) => a.stepNo - b.stepNo)
    const currentStep = steps.find(s => s.id === stepId)
    if (!currentStep) {
      return NextResponse.json({ error: '工序不属于该工艺路线' }, { status: 400 })
    }

    // 3. 防呆：检查是否上一工序已完成
    const prevStep = steps.find(s => s.stepNo === currentStep.stepNo - 1)
    if (prevStep) {
      const prevReport = order.reports.find(r => r.stepId === prevStep.id && r.endTime)
      if (!prevReport) {
        return NextResponse.json(
          { error: `上一工序「${prevStep.name}」未完成，不可报工` },
          { status: 400 }
        )
      }
    }

    // 4. 检查是否已报工
    const existingReport = order.reports.find(r => r.stepId === stepId && !r.endTime)
    if (existingReport) {
      // 更新已开工的报工记录
      await prisma.workReport.update({
        where: { id: existingReport.id },
        data: {
          endTime: new Date(),
          goodQty,
          badQty,
          badReason,
          remark,
          photoUrls: photoUrls ?? [],
        },
      })
    } else {
      // 新建报工记录
      await prisma.workReport.create({
        data: {
          orderId,
          stepId,
          workerName,
          workerId,
          startTime: new Date(),
          endTime: new Date(),
          goodQty,
          badQty,
          badReason,
          remark,
          photoUrls: photoUrls ?? [],
        },
      })
    }

    // 5. 更新工单状态
    const allReports = await prisma.workReport.findMany({
      where: { orderId },
      include: { step: true },
    })

    const allStepsDone = steps.every(s =>
      allReports.some(r => r.stepId === s.id && r.endTime)
    )

    if (allStepsDone) {
      await prisma.productionOrder.update({
        where: { id: orderId },
        data: {
          status: 'QC_WAITING',
          completeTime: new Date(),
        },
      })
    } else if (order.status === 'PICKED') {
      await prisma.productionOrder.update({
        where: { id: orderId },
        data: { status: 'RUNNING' },
      })
    }

    return NextResponse.json({ success: true, message: '报工成功' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Report error:', error)
    return NextResponse.json({ error: '报工失败' }, { status: 500 })
  }
}

// GET: 获取工单的报工记录
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reports = await prisma.workReport.findMany({
      where: { orderId: params.id },
      include: { step: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ data: reports })
  } catch (error) {
    console.error('Get reports error:', error)
    return NextResponse.json({ error: '获取报工记录失败' }, { status: 500 })
  }
}
