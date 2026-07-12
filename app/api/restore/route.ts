import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { hasResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { SOFT_DELETE_MODELS, SoftDeleteModelKey } from '@/lib/soft-delete'

export const dynamic = 'force-dynamic'

const restoreSchema = z.object({
  model: z.enum(['materialIn', 'order', 'dispatch', 'shipment', 'return']),
  id: z.string().min(1),
})

export async function PATCH(req: NextRequest) {
  try {
    const current = await getCurrentOperator()
    if (!current || !(await hasResourcePermission(current.role, 'system', 'update'))) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const { model, id } = restoreSchema.parse(body)
    const config = SOFT_DELETE_MODELS[model as SoftDeleteModelKey]
    const delegate: any = config.delegate

    const before = await delegate.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }

    const restored = await delegate.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null },
    })

    await writeAuditLog(req, {
      action: 'RESTORE',
      entityType: config.entityType,
      entityId: restored.id,
      entityLabel: restored[config.labelField],
      beforeData: before,
      afterData: restored,
    })

    return NextResponse.json({ data: restored, message: '记录已恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Restore record error:', error)
    return NextResponse.json({ error: '恢复失败' }, { status: 500 })
  }
}
