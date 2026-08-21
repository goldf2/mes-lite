import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { qualityInspectionStandardInputSchema } from '@/modules/quality/contracts/quality-inspection-standard-schema'
import { qualityHttpError } from '@/modules/quality/http/quality-http'
import { createQualityInspectionStandard } from '@/modules/quality/server/quality-inspection-standard-service'
import { getQualityInspectionStandardWorkspace } from '@/modules/quality/server/quality-inspection-standard-query-service'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { qualityStandardSearchFieldKeys } from '@/modules/quality/model/quality-search-fields'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('qualityStandards', 'read')
  if (denied) return denied
  const parsed = parseResourceSearchConditions(req.nextUrl.searchParams.get('advanced'), qualityStandardSearchFieldKeys)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
  return NextResponse.json({ data: await getQualityInspectionStandardWorkspace({
    keyword: req.nextUrl.searchParams.get('keyword') || '', status: req.nextUrl.searchParams.get('status') || '',
    advancedConditions: parsed.conditions,
  }) })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('qualityStandards', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const data = await createQualityInspectionStandard(qualityInspectionStandardInputSchema.parse(await req.json()), {
      operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return qualityHttpError(error, '创建检验标准失败') }
}
