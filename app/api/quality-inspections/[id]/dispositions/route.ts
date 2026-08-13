import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { disposeQualityInspectionSchema, QualityInspectionDomainError } from '@/modules/quality'
import { disposeQualityInspection } from '@/modules/quality/server/quality-inspection-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

const releaseActions = new Set(['CONCESSION', 'UNFREEZE'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const input = disposeQualityInspectionSchema.parse(await req.json())
    const resource = releaseActions.has(input.action) ? 'qualityRelease' : 'qualityDisposition'
    const denied = await requireResourcePermission(resource, 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await disposeQualityInspection(params.id, input, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: `QUALITY_${input.action}`,
      entityType: 'QUALITY_DISPOSITION',
      entityId: result.disposition.id,
      entityLabel: result.disposition.dispositionNo,
      beforeData: result.before || null,
      afterData: result.disposition,
      note: input.reason,
    })
    return NextResponse.json({
      data: result,
      message: result.duplicate ? '该质量处置已处理，无需重复提交' : '质量处置已完成并写入独立追溯记录',
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof QualityInspectionDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '保存质量处置失败' }, { status: 500 })
  }
}
