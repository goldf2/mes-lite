import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { getRolePermissionMap } from '@/lib/permissions'

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ data: null })

  const permissions = await getRolePermissionMap(operator.role)
  return NextResponse.json({ data: { ...operator, permissions } })
}
