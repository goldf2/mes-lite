import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { releaseCuttingTask } from '@/lib/cutting-execution'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  clientRequestId: z.string().min(8).max(120),
  cuttingPlanId: z.string().min(1),
  device: z.string().trim().max(100).optional().nullable(),
  shift: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingTasks', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')?.trim()
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 30)))
    const where: any = {}
    if (status) where.status = status

    const [data, total] = await Promise.all([
      prisma.cuttingTask.findMany({
        where,
        include: {
          rawMaterial: {
            select: { id: true, code: true, name: true, spec: true, stockUnit: true, valuationUnit: true },
          },
          cuttingPlan: {
            include: {
              demandLines: {
                include: {
                  demand: {
                    select: {
                      id: true,
                      demandNo: true,
                      productionOrderId: true,
                      outputCodeSnapshot: true,
                      outputNameSnapshot: true,
                      pieceLengthMm: true,
                    },
                  },
                },
              },
              sources: {
                include: {
                  entity: {
                    select: {
                      id: true,
                      entityNo: true,
                      actualLengthMm: true,
                      location: true,
                      batchNo: true,
                    },
                  },
                  cuts: {
                    include: {
                      planDemand: {
                        include: {
                          demand: {
                            select: {
                              id: true,
                              demandNo: true,
                              outputCodeSnapshot: true,
                              outputNameSnapshot: true,
                            },
                          },
                        },
                      },
                    },
                    orderBy: { sequence: 'asc' },
                  },
                },
                orderBy: [{ entity: { entityNo: 'asc' } }, { sourceUnitIndex: 'asc' }],
              },
            },
          },
          sources: {
            include: {
              outputs: true,
              sourceEntity: { select: { id: true, entityNo: true, status: true } },
              remnantEntity: {
                select: { id: true, entityNo: true, actualLengthMm: true, status: true, location: true },
              },
            },
            orderBy: { sourceUnitIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cuttingTask.count({ where }),
    ])
    return NextResponse.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get cutting tasks error:', error)
    return NextResponse.json({ error: '获取锯切任务失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingTasks', 'create')
    if (denied) return denied
    const input = createSchema.parse(await req.json())
    const task = await prisma.$transaction((tx) => releaseCuttingTask(tx, input))
    await writeAuditLog(req, {
      action: 'RELEASE',
      entityType: 'CUTTING_TASK',
      entityId: task.id,
      entityLabel: task.taskNo,
      afterData: {
        cuttingPlanId: task.cuttingPlanId,
        status: task.status,
        device: task.device,
        shift: task.shift,
      },
    })
    return NextResponse.json({ data: task, message: `锯切任务 ${task.taskNo} 已下发` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '下发锯切任务失败' }, { status: 400 })
  }
}
