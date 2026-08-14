import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { loadEffectiveDataScope } from '@/modules/identity-access'
import { qualityTrendQuerySchema } from '@/modules/quality/contracts/quality-trend-schema'
import { qualityHttpError } from '@/modules/quality/http/quality-http'
import { getQualityTrendWorkspace } from '@/modules/quality/server/quality-trend-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('quality', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const parsed = qualityTrendQuerySchema.parse({
      startDate: req.nextUrl.searchParams.get('startDate') || undefined,
      endDate: req.nextUrl.searchParams.get('endDate') || undefined,
      materialId: req.nextUrl.searchParams.get('materialId') || undefined,
      sourceType: req.nextUrl.searchParams.get('sourceType') || undefined,
    })
    return NextResponse.json({ data: await getQualityTrendWorkspace(parsed, await loadEffectiveDataScope(operator)) })
  } catch (error) { return qualityHttpError(error, '获取质量趋势失败') }
}
