import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { executeMaterialCodeNormalizationSchema } from '@/modules/operations-tools/contracts/maintenance'
import { executeMaterialCodeNormalization } from '@/modules/operations-tools/server/material-code-normalization-command-service'
import { getMaterialCodeNormalizationPreview } from '@/modules/operations-tools/server/material-code-normalization-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getMaterialCodeNormalizationPreview() })
  } catch (error) {
    console.error('Preview material code normalization error:', error)
    return NextResponse.json({ error: '检查物料编码失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    executeMaterialCodeNormalizationSchema.parse(await req.json())
    const result = await executeMaterialCodeNormalization()
    if (result.blocked) return NextResponse.json({
      error: '存在空编码、编码冲突或关联产品冲突，请先处理后再执行', data: result.preview,
    }, { status: 409 })
    await writeAuditLog(req, {
      action: 'NORMALIZE_CODES', entityType: 'MATERIAL', entityLabel: '物料编码批量规范化',
      beforeData: result.applied.changes.map((item) => ({ id: item.id, code: item.before })),
      afterData: result.applied.changes.map((item) => ({ id: item.id, code: item.after })),
      note: `删除全部空白字符并转换为大写；物料 ${result.applied.changedMaterials} 条，关联产品 ${result.applied.changedProducts} 条`,
    })
    return NextResponse.json({ data: {
      changedMaterials: result.applied.changedMaterials, changedProducts: result.applied.changedProducts,
    } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '缺少执行确认' }, { status: 400 })
    console.error('Execute material code normalization error:', error)
    return NextResponse.json({ error: '物料编码转换失败，数据未修改' }, { status: 500 })
  }
}
