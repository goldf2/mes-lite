import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { calculateCuttingPlanFromDatabase } from '@/lib/cutting'

const nonnegative = z.number().finite().nonnegative()
const schema = z.object({
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

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'read')
    if (denied) return denied
    const input = schema.parse(await req.json())
    const result = await prisma.$transaction((tx) => calculateCuttingPlanFromDatabase(tx, input))
    return NextResponse.json({ data: result.calculation })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '计算排样失败' }, { status: 400 })
  }
}
