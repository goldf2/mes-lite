import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { costObjectInputSchema } from '@/modules/bom/contracts/cost-object-schema'
import { createCostObject } from '@/modules/bom/server/cost-object-command-service'
import { listCostObjectWorkspace } from '@/modules/bom/server/cost-object-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireResourcePermission('bomCost', 'read')
  if (denied) return denied
  return NextResponse.json(await listCostObjectWorkspace())
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'create')
    if (denied) return denied
    const costObject = await createCostObject(costObjectInputSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'COST_OBJECT', entityId: costObject.id,
      entityLabel: `${costObject.code} ${costObject.name}`, afterData: costObject,
    })
    return NextResponse.json({ data: costObject }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create cost object error:', error)
    return NextResponse.json({ error: '保存成本对象失败，请检查编码是否重复' }, { status: 500 })
  }
}
