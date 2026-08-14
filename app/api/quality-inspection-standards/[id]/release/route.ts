import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { qualityHttpError } from '@/modules/quality/http/quality-http'
import { releaseQualityInspectionStandard } from '@/modules/quality/server/quality-inspection-standard-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('qualityStandards', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const data = await releaseQualityInspectionStandard(params.id, {
      operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return qualityHttpError(error, '发布检验标准失败') }
}
