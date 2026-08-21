import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { createDispatchSchema } from '@/modules/production/contracts/dispatch-schema'
import { DispatchDomainError } from '@/modules/production/domain/dispatch-errors'
import { archiveManagedDispatch, createManagedDispatch } from '@/modules/production/server/dispatch-command-service'
import { listManagedDispatchEmployees, listManagedDispatches } from '@/modules/production/server/dispatch-query-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { getCurrentOperator } from '@/lib/auth'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { dispatchSearchFieldKeys } from '@/modules/production/model/production-search-fields'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const scope = await loadEffectiveDataScope(operator)
    const { searchParams } = new URL(req.url)
    if (searchParams.get('options') === 'employees') {
      return NextResponse.json({ data: await listManagedDispatchEmployees(scope) })
    }
    const advanced = parseResourceSearchConditions(searchParams.get('advanced'), dispatchSearchFieldKeys)
    if (advanced.error) return NextResponse.json({ error: advanced.error }, { status: 400 })
    const result = await listManagedDispatches({
      statuses: parseStatusFilter(searchParams),
      workerName: searchParams.get('workerName'),
      orderId: searchParams.get('orderId'),
      customerId: searchParams.get('customerId'),
      keyword: searchParams.get('keyword'),
      advancedConditions: advanced.conditions,
      page: Number(searchParams.get('page') ?? 1) || 1,
      pageSize: Number(searchParams.get('pageSize') ?? 20) || 20,
    }, scope)
    return NextResponse.json({ data: result.items, pagination: result.pagination })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get dispatches error:', error)
    return NextResponse.json({ error: '获取派工单列表失败' }, { status: 500 })
  }
}
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const dispatch = await createManagedDispatch(createDispatchSchema.parse(await req.json()), new Date(), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'DISPATCH', entityId: dispatch.id,
      entityLabel: dispatch.dispatchNo, afterData: dispatch,
    })
    return NextResponse.json({ data: dispatch }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create dispatch error:', error)
    return NextResponse.json({ error: '创建派工单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dispatch', 'delete')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少派工单 ID' }, { status: 400 })
    const { current, updated } = await archiveManagedDispatch(id, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'DISPATCH', entityId: updated.id,
      entityLabel: updated.dispatchNo, beforeData: current, afterData: updated,
    })
    return NextResponse.json({ success: true, message: '派工单已归档，可在归档记录中恢复' })
  } catch (error) {
    if (error instanceof DispatchDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive dispatch error:', error)
    return NextResponse.json({ error: '归档派工单失败' }, { status: 500 })
  }
}
