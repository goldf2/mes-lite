import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { getEffectivePermissionMap } from '@/lib/permissions'

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ data: null })

  const permissions = await getEffectivePermissionMap(operator)
  return NextResponse.json({ data: { ...operator, permissions } })
}
