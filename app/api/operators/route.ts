import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { updateOperatorSchema } from '@/modules/identity-access/contracts/operator-admin'
import {
  listOperators,
  OperatorAdminError,
  updateOperatorAdministration,
} from '@/modules/identity-access/server/operator-admin-service'

function operatorError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof OperatorAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Update operator error:', error)
  return NextResponse.json({ error: '更新失败' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('operators', 'read')
  if (denied) return denied

  return NextResponse.json({ data: await listOperators(parseStatusFilter(new URL(req.url).searchParams)) })
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
