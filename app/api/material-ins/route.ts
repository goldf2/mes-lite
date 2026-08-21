import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { createMaterialInSchema } from '@/modules/receiving/contracts/material-in-schema'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { archiveMaterialIn, createMaterialIns, listMaterialIns } from '@/modules/receiving/server/material-in-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { materialInSearchFieldKeys } from '@/modules/receiving/model/material-in-search-fields'
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const advanced = parseResourceSearchConditions(searchParams.get('advanced'), materialInSearchFieldKeys)
    if (advanced.error) return NextResponse.json({ error: advanced.error }, { status: 400 })
    const result = await listMaterialIns({
      statuses: parseStatusFilter(searchParams),
      keyword: searchParams.get('keyword'),
      supplierId: searchParams.get('supplierId'),
      customerId: searchParams.get('customerId'),
      advancedConditions: advanced.conditions || [],
      page: Number(searchParams.get('page') ?? '1'),
      pageSize: Number(searchParams.get('pageSize') ?? '20'),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: result.items, pagination: result.pagination })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get material-ins error:', error)
    return NextResponse.json({ error: '获取来料单列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const result = await createMaterialIns(createMaterialInSchema.parse(await req.json()), new Date(), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'MATERIAL_IN',
      entityId: result.first.id,
      entityLabel: result.first.inboundNo,
      afterData: result.first,
    })
    return NextResponse.json({ data: result.first, items: result.items, count: result.items.length }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof MaterialInDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error && /必须|不能为负|必须大于|库位/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Create material-in error:', error)
    return NextResponse.json({ error: '创建来料单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materialIn', 'delete')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少来料单 ID' }, { status: 400 })
    const { current, updated } = await archiveMaterialIn(id, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'MATERIAL_IN',
      entityId: updated.id,
      entityLabel: updated.inboundNo,
      beforeData: current,
      afterData: updated,
    })
    return NextResponse.json({ success: true, message: '来料单已归档，可在归档记录中恢复' })
  } catch (error) {
    if (error instanceof MaterialInDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive material-in error:', error)
    return NextResponse.json({ error: '归档来料单失败' }, { status: 500 })
  }
}
