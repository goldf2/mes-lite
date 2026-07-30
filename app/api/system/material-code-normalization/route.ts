import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  applyMaterialCodeNormalization,
  getMaterialCodeNormalizationPreview,
} from '@/lib/material-code-normalization'

export const dynamic = 'force-dynamic'

const executeSchema = z.object({
  confirmation: z.literal('NORMALIZE_MATERIAL_CODES'),
})

export async function GET() {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    const preview = await getMaterialCodeNormalizationPreview()
    return NextResponse.json({ data: preview })
  } catch (error) {
    console.error('Preview material code normalization error:', error)
    return NextResponse.json({ error: '检查物料编码失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = executeSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: '缺少执行确认' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const preview = await getMaterialCodeNormalizationPreview(tx)
      if (!preview.canExecute) {
        return { blocked: true as const, preview }
      }
      const applied = await applyMaterialCodeNormalization(tx, preview)
      return { blocked: false as const, preview, applied }
    })

    if (result.blocked) {
      return NextResponse.json(
        { error: '存在空编码、编码冲突或关联产品冲突，请先处理后再执行', data: result.preview },
        { status: 409 },
      )
    }

    await writeAuditLog(req, {
      action: 'NORMALIZE_CODES',
      entityType: 'MATERIAL',
      entityLabel: '物料编码批量规范化',
      beforeData: result.applied.changes.map((change) => ({ id: change.id, code: change.before })),
      afterData: result.applied.changes.map((change) => ({ id: change.id, code: change.after })),
      note: `删除全部空白字符并转换为大写；物料 ${result.applied.changedMaterials} 条，关联产品 ${result.applied.changedProducts} 条`,
    })

    return NextResponse.json({
      data: {
        changedMaterials: result.applied.changedMaterials,
        changedProducts: result.applied.changedProducts,
      },
    })
  } catch (error) {
    console.error('Execute material code normalization error:', error)
    return NextResponse.json({ error: '物料编码转换失败，数据未修改' }, { status: 500 })
  }
}
