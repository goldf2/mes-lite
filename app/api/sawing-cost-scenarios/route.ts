import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const number = z.number().finite().nonnegative()
const schema = z.object({
  name: z.string().trim().min(1, '方案名称必填').max(100),
  materialLength: number.positive(), materialWeight: number.positive(), workpieceLength: number.positive(), bladeThickness: number,
  rawMaterialPrice: number, sawdustPrice: number, scrapPrice: number, finishedPrice: number,
  quantity: z.number().int().positive(), utilization: number, productWeight: number, sawdustWeight: number, scrapWeight: number,
  netMaterialCost: number, materialCostPerPiece: number, profitPerPiece: z.number().finite(), totalRevenue: number, totalProfit: z.number().finite(), grossMargin: z.number().finite(),
  additionalDirectCost: z.number().finite(), laborCost: number, fixedCost: number, directStageCost: z.number().finite(), manufacturingCost: z.number().finite(), fullCost: z.number().finite(),
  directProfit: z.number().finite(), manufacturingProfit: z.number().finite(), fullProfit: z.number().finite(), directMargin: z.number().finite(), manufacturingMargin: z.number().finite(), fullMargin: z.number().finite(),
  processTemplateIds: z.array(z.string()).default([]),
  costItems: z.array(z.object({
    stage: z.enum(['DIRECT', 'LABOR', 'FIXED']), name: z.string().trim().min(1), method: z.string().min(1),
    inputA: number, inputB: number, inputC: number, amount: z.number().finite(), isDeduction: z.boolean(), note: z.string().optional(), sortOrder: z.number().int().nonnegative(),
  })).default([]),
})

const include = { processTemplates: { select: { id: true, code: true, name: true, category: true } }, costItems: { orderBy: [{ stage: 'asc' as const }, { sortOrder: 'asc' as const }] } }

export async function GET() {
  const denied = await requireResourcePermission('sawingCost', 'read')
  if (denied) return denied
  const [data, processTemplates] = await Promise.all([
    prisma.sawingCostScenario.findMany({ include, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.processTemplate.findMany({ select: { id: true, code: true, name: true, category: true }, orderBy: [{ category: 'asc' }, { code: 'asc' }] }),
  ])
  return NextResponse.json({ data, processTemplates })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('sawingCost', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const input = schema.parse(await req.json())
    const { processTemplateIds, costItems, ...values } = input
    const scenario = await prisma.sawingCostScenario.create({
      data: { ...values, createdBy: operator?.name || operator?.username || null, processTemplates: { connect: processTemplateIds.map((id) => ({ id })) }, costItems: { create: costItems } },
      include,
    })
    await writeAuditLog(req, { action: 'CREATE', entityType: 'SAWING_COST_SCENARIO', entityId: scenario.id, entityLabel: scenario.name, afterData: scenario })
    return NextResponse.json({ data: scenario }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create sawing cost scenario error:', error)
    return NextResponse.json({ error: '保存锯切成本方案失败' }, { status: 500 })
  }
}
