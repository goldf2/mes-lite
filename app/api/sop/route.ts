import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { getReadableSopCatalog } from '@/modules/sop/server/sop-catalog'

export async function GET(request: NextRequest) {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const pageKey = request.nextUrl.searchParams.get('pageKey')?.trim() || undefined
  return NextResponse.json({ data: await getReadableSopCatalog(operator, pageKey) })
}
