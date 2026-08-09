import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { saveSawingScenarioSchema } from '@/modules/operations-tools/contracts/sawing-cost'
import { createSawingCostScenario, SawingCostServiceError } from '@/modules/operations-tools/server/sawing-cost-command-service'
import { listSawingCostWorkspace } from '@/modules/operations-tools/server/sawing-cost-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireResourcePermission('sawingCost', 'read')
  if (denied) return denied
  return NextResponse.json(await listSawingCostWorkspace())
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('sawingCost', 'create')
    if (denied) return denied
    const scenario = await createSawingCostScenario(saveSawingScenarioSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'SAWING_COST_SCENARIO', entityId: scenario.id,
      entityLabel: scenario.name, afterData: scenario,
    })
    return NextResponse.json({ data: scenario }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof SawingCostServiceError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Create sawing cost scenario error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存锯切成本方案失败' }, { status: 500 })
  }
}
