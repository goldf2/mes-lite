import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { deleteOperatorSchema, updateOperatorSchema } from '@/modules/identity-access/contracts/operator-admin'
import {
  deleteOperatorAdministration,
  listOperators,
  OperatorAdminError,
  updateOperatorAdministration,
} from '@/modules/identity-access/server/operator-admin-service'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { operatorSearchFieldKeys } from '@/modules/identity-access/model/operator-search-fields'

function operatorError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof OperatorAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Operator administration error:', error)
  return NextResponse.json({ error: '人员管理操作失败' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('operators', 'read')
  if (denied) return denied

  const searchParams = new URL(req.url).searchParams
  const advanced = parseResourceSearchConditions(searchParams.get('advanced'), operatorSearchFieldKeys)
  if (advanced.error) return NextResponse.json({ error: advanced.error }, { status: 400 })
  return NextResponse.json({ data: await listOperators(parseStatusFilter(searchParams), searchParams.get('keyword') || '', advanced.conditions) })
}

export async function PATCH(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })

  try {
    const operator = await updateOperatorAdministration(
      current,
      updateOperatorSchema.parse(await req.json()),
      await getAuditContext(req),
    )
    return NextResponse.json({ data: operator, message: '操作人员已更新' })
  } catch (error) {
    return operatorError(error)
  }
}

export async function DELETE(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })

  try {
    const { id } = deleteOperatorSchema.parse({ id: new URL(req.url).searchParams.get('id') })
    const operator = await deleteOperatorAdministration(current, id, await getAuditContext(req))
    return NextResponse.json({ data: operator, message: '人员账号已删除' })
  } catch (error) {
    return operatorError(error)
  }
}
