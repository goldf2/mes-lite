import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { getAuditContext } from '@/lib/audit'
import { resetOperatorPasswordSchema } from '@/modules/identity-access/contracts/operator-admin'
import {
  OperatorAdminError,
  resetOperatorPasswordAdministration,
} from '@/modules/identity-access/server/operator-admin-service'

export async function POST(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current) return NextResponse.json({ error: '无权限' }, { status: 403 })

  try {
    const operator = await resetOperatorPasswordAdministration(
      current,
      resetOperatorPasswordSchema.parse(await req.json()),
      await getAuditContext(req),
    )
    return NextResponse.json({ data: operator, message: '密码已重置，全部登录会话已撤销' })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof OperatorAdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Reset operator password error:', error)
    return NextResponse.json({ error: '密码重置失败' }, { status: 500 })
  }
}
