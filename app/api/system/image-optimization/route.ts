import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  getMaterialImageOptimizationPreview,
  MATERIAL_IMAGE_OPTIMIZATION_SCOPE,
  optimizeMaterialImages,
} from '@/lib/material-image-optimization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const executeSchema = z.object({
  scope: z.literal(MATERIAL_IMAGE_OPTIMIZATION_SCOPE),
  attachmentIds: z.array(z.string().min(1)).min(1).max(10),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dataTools', 'read')
    if (denied) return denied

    const scope = new URL(req.url).searchParams.get('scope') || MATERIAL_IMAGE_OPTIMIZATION_SCOPE
    if (scope !== MATERIAL_IMAGE_OPTIMIZATION_SCOPE) {
      return NextResponse.json({ error: '暂不支持该图片范围' }, { status: 400 })
    }

    return NextResponse.json({ data: await getMaterialImageOptimizationPreview() })
  } catch (error) {
    console.error('Preview image optimization error:', error)
    return NextResponse.json({ error: '检查图片优化状态失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('dataTools', 'update')
    if (denied) return denied

    const body = executeSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: '图片范围或批次参数无效' }, { status: 400 })
    }

    const results = await optimizeMaterialImages(body.data.attachmentIds)
    const succeeded = results.filter((result) => result.success).length
    const failed = results.length - succeeded

    await writeAuditLog(req, {
      action: 'OPTIMIZE_IMAGES',
      entityType: 'DOCUMENT_ATTACHMENT',
      entityLabel: '物料图片批量优化',
      afterData: results,
      note: `生成 WebP 缩略图和展示图；成功 ${succeeded} 张，失败 ${failed} 张；原图保留`,
    })

    return NextResponse.json({ data: { succeeded, failed, results } })
  } catch (error) {
    console.error('Execute image optimization error:', error)
    return NextResponse.json({ error: '图片优化失败，原图未受影响' }, { status: 500 })
  }
}
