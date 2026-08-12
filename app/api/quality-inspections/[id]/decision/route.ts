import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { decideQualityInspectionSchema, QualityInspectionDomainError } from '@/modules/quality'
import { decideQualityInspection } from '@/modules/quality/server/quality-inspection-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('qualityDecision', 'update')
    if (denied) return denied
    const input = decideQualityInspectionSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await decideQualityInspection(params.id, input, operatorDisplayName(operator))
    await writeAuditLog(req, {
      action: input.decision === 'PASS' ? 'QUALITY_RELEASE' : input.decision === 'FAIL' ? 'QUALITY_HOLD' : 'QUALITY_PARTIAL_DECISION',
      entityType: 'QUALITY_INSPECTION',
      entityId: result.updated.id,
      entityLabel: result.updated.inspectionNo,
      beforeData: result.before,
      afterData: result.updated,
      note: input.note,
    })
    return NextResponse.json({
      data: result.updated,
      message: input.decision === 'PASS'
        ? '质量判定已保存，整批库存已放行'
        : input.decision === 'FAIL'
          ? '质量判定已保存，整批库存已冻结'
          : '质量判定已保存，合格数量已放行，不合格数量已冻结',
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof QualityInspectionDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '保存质量判定失败' }, { status: 500 })
  }
}
