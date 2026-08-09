import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { bomCostRunInputSchema } from '@/modules/bom/contracts/bom-cost'
import { createBomCostRun, BomCostServiceError } from '@/modules/bom/server/bom-cost-command-service'
import { listBomCostWorkspace } from '@/modules/bom/server/bom-cost-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('bomCost', 'read')
  if (denied) return denied
  try {
    const productId = new URL(req.url).searchParams.get('productId') || undefined
    return NextResponse.json(await listBomCostWorkspace(productId))
  } catch (error) {
    console.error('Get BOM cost data error:', error)
    return NextResponse.json({ error: '获取 BOM 成本数据失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const run = await createBomCostRun(
      bomCostRunInputSchema.parse(await req.json()),
      operator?.name || operator?.username || null,
    )
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'BOM_COST_RUN', entityId: run.id,
      entityLabel: `${run.product.sku} BOM成本`, afterData: run,
    })
    return NextResponse.json({ data: run }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof BomCostServiceError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Calculate BOM cost error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'BOM 成本计算失败' }, { status: 500 })
  }
}
