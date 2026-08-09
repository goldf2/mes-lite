import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { createReturnSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { archiveManagedReturn, createManagedReturn } from '@/modules/sales/server/fulfillment-command-service'
import { listReturns } from '@/modules/sales/server/fulfillment-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'read')
    if (denied) return denied
    const params = new URL(req.url).searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 20)))
    return NextResponse.json(await listReturns({
      statuses: parseStatusFilter(params), keyword: params.get('keyword'), customerId: params.get('customerId'), page, pageSize,
    }))
  } catch (error) {
    console.error('Get returns error:', error)
    return NextResponse.json({ error: '获取退货单列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'create')
    if (denied) return denied
    const returnOrder = await createManagedReturn(createReturnSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'RETURN', entityId: returnOrder.id,
      entityLabel: returnOrder.returnNo, afterData: returnOrder,
    })
    return NextResponse.json({ data: returnOrder }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create return error:', error)
    return NextResponse.json({ error: '创建退货单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('return', 'delete')
    if (denied) return denied
    const id = z.string().trim().min(1, '缺少退货单 ID').parse(new URL(req.url).searchParams.get('id'))
    const { before, updated } = await archiveManagedReturn(id)
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'RETURN', entityId: updated.id,
      entityLabel: updated.returnNo, beforeData: before, afterData: updated,
    })
    return NextResponse.json({ success: true, message: '退货单已归档，可在归档记录中恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive return error:', error)
    return NextResponse.json({ error: '归档退货单失败' }, { status: 500 })
  }
}
