import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { flowTransferInputSchema } from '@/modules/production/contracts/flow-transfer-schema'
import { FlowTransferDomainError } from '@/modules/production/domain/flow-transfer-errors'
import { createManagedFlowTransfer } from '@/modules/production/server/flow-transfer-command-service'
import { loadManagedFlowTransferWorkspace } from '@/modules/production/server/flow-transfer-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { flowTransferSearchFieldKeys } from '@/modules/production/model/production-search-fields'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('flowTransfers', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const scope = await loadEffectiveDataScope(operator)
    const { searchParams } = new URL(req.url)
    const advanced = parseResourceSearchConditions(searchParams.get('advanced'), flowTransferSearchFieldKeys)
    if (advanced.error) return NextResponse.json({ error: advanced.error }, { status: 400 })
    const result = await loadManagedFlowTransferWorkspace({
      keyword: searchParams.get('keyword'), status: searchParams.get('status'), advancedConditions: advanced.conditions,
    }, scope)
    return NextResponse.json({
      data: result.transfers, materials: result.materials,
      locations: result.locations, employees: result.employees,
    })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get flow transfers error:', error)
    return NextResponse.json({ error: '获取流程转移记录失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('flowTransfers', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const transfer = await createManagedFlowTransfer(flowTransferInputSchema.parse(await req.json()), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'FLOW_TRANSFER', entityId: transfer.id,
      entityLabel: transfer.transferNo, afterData: transfer, note: '创建流程转移草稿，尚未变动库存',
    })
    return NextResponse.json({ data: transfer, message: '流程转移草稿已创建' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof FlowTransferDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create flow transfer error:', error)
    return NextResponse.json({ error: '创建流程转移失败' }, { status: 500 })
  }
}
