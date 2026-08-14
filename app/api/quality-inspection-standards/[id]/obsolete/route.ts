import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { obsoleteQualityInspectionStandardSchema } from '@/modules/quality/contracts/quality-inspection-standard-schema'
import { qualityHttpError } from '@/modules/quality/http/quality-http'
import { obsoleteQualityInspectionStandard } from '@/modules/quality/server/quality-inspection-standard-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('qualityStandards', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const data = await obsoleteQualityInspectionStandard(params.id, obsoleteQualityInspectionStandardSchema.parse(await req.json()), {
      operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    })
    return NextResponse.json({ data })
  } catch (error) { return qualityHttpError(error, '停用检验标准失败') }
}
