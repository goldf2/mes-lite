import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { dataIntegrityActionSchema } from '@/modules/operations-tools/contracts/maintenance'
import { dataIntegrityActionMessages, executeDataIntegrityAction } from '@/modules/operations-tools/server/data-integrity-command-service'
import { getDataIntegrityReport } from '@/modules/operations-tools/server/data-integrity-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getDataIntegrityReport() })
  } catch (error) {
    console.error('Check data integrity error:', error)
    return NextResponse.json({ error: '数据关系检查失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = dataIntegrityActionSchema.parse(await req.json())
    const denied = await requireResourcePermission('system', input.action.startsWith('DELETE_') ? 'delete' : 'update')
    if (denied) return denied
    const result = await executeDataIntegrityAction(input, await getAuditContext(req))
    return NextResponse.json({
      data: { issueId: result.issue.id, action: input.action },
      message: dataIntegrityActionMessages[input.action],
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ error: '数据关系处理失败，数据未修改' }, { status: 500 })
  }
}
