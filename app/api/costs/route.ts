import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { productionCostRecordInputSchema } from '@/modules/production/contracts/production-cost-record-schema'
import { createProductionCostRecord } from '@/modules/production/server/production-cost-record-command-service'
import { listProductionCostRecords } from '@/modules/production/server/production-cost-record-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied
    const params = req.nextUrl.searchParams
    return NextResponse.json(await listProductionCostRecords({
      costType: params.get('costType'), startDate: params.get('startDate'), endDate: params.get('endDate'),
      page: Math.max(1, Number(params.get('page') ?? '1')),
      pageSize: Math.max(1, Number(params.get('pageSize') ?? '20')),
    }))
  } catch (error) {
    console.error('Get costs error:', error)
    return NextResponse.json({ error: '获取成本列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'create')
    if (denied) return denied
    const record = await createProductionCostRecord(productionCostRecordInputSchema.parse(await req.json()))
    return NextResponse.json({ data: record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create cost error:', error)
    return NextResponse.json({ error: '创建成本记录失败' }, { status: 500 })
  }
}
