import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { confirmCuttingPlan } from '@/lib/cutting'

export const dynamic = 'force-dynamic'

const nonnegative = z.number().finite().nonnegative()
const createSchema = z.object({
  clientRequestId: z.string().min(8).max(120),
  demandLines: z.array(z.object({
    demandId: z.string().min(1),
    requestedQty: z.number().int().positive(),
  })).min(1).max(50),
  sources: z.array(z.object({
    entityId: z.string().min(1),
    selectedQty: z.number().int().positive(),
  })).min(1).max(500),
  rules: z.object({
    kerfMm: nonnegative,
    headTrimMm: nonnegative,
    tailTrimMm: nonnegative,
    clampDeadZoneMm: nonnegative,
  }).partial().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')?.trim()
    const demandId = searchParams.get('demandId')?.trim()
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 30)))
    const where: any = {}
    if (status) where.status = status
    if (demandId) where.demandLines = { some: { demandId } }

    const [data, total] = await Promise.all([
      prisma.cuttingPlan.findMany({
        where,
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
                  rawMaterialCodeSnapshot: true,
                  pieceLengthMm: true,
                },
              },
            },
          },
          sources: {
            include: {
              entity: {
                select: { id: true, entityNo: true, actualLengthMm: true, location: true },
              },
              cuts: {
                include: { planDemand: { select: { demandId: true } } },
                orderBy: { sequence: 'asc' },
              },
            },
            orderBy: [{ entity: { entityNo: 'asc' } }, { sourceUnitIndex: 'asc' }],
          },
        },
        orderBy: { confirmedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cuttingPlan.count({ where }),
    ])
    return NextResponse.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get cutting plans error:', error)
    return NextResponse.json({ error: '获取排样方案失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'create')
    if (denied) return denied
    const input = createSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const plan = await prisma.$transaction((tx) => confirmCuttingPlan(tx, input, {
      id: operator?.id,
      name: operator?.name || operator?.username,
    }))
    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'CUTTING_PLAN',
      entityId: plan.id,
      entityLabel: plan.planNo,
      afterData: {
        status: plan.status,
        demandIds: plan.demandLines.map((item) => item.demandId),
        sourceIds: plan.sources.map((item) => item.entityId),
        totalPlannedQty: plan.totalPlannedQty,
      },
    })
    return NextResponse.json({ data: plan, message: `排样方案 ${plan.planNo} 已确认并占用实体` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '确认排样失败' }, { status: 400 })
  }
}
