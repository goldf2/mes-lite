import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createAuditLog, getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  applyDataIntegrityAction,
  DataIntegrityActionKey,
  getDataIntegrityReport,
} from '@/lib/data-integrity'

export const dynamic = 'force-dynamic'

const actionSchema = z.object({
  issueId: z.string().min(1),
  action: z.enum([
    'SYNC_BOM_ITEM_UNIT',
    'DELETE_BOM_ITEM',
    'SYNC_BOM_OUTPUT_UNIT',
    'SYNC_PRODUCT_UNIT',
    'CLEAR_STALE_BOM_ITEM_REF',
  ]),
  confirmation: z.string().optional(),
})

const actionMessages: Record<DataIntegrityActionKey, string> = {
  SYNC_BOM_ITEM_UNIT: 'BOM 原料单位已按当前主库存单位修复',
  DELETE_BOM_ITEM: '错误 BOM 明细已删除',
  SYNC_BOM_OUTPUT_UNIT: 'BOM 产出单位已同步',
  SYNC_PRODUCT_UNIT: '兼容产品单位已同步',
  CLEAR_STALE_BOM_ITEM_REF: '生产日报的失效 BOM 明细指针已清理',
}

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
    const input = actionSchema.parse(await req.json())
    const permissionAction = input.action === 'DELETE_BOM_ITEM' ? 'delete' : 'update'
    const denied = await requireResourcePermission('system', permissionAction)
    if (denied) return denied
    if (input.action === 'DELETE_BOM_ITEM' && input.confirmation !== 'DELETE_ERROR_DATA') {
      return NextResponse.json({ error: '缺少删除确认' }, { status: 400 })
    }

    const auditContext = await getAuditContext(req)
    const result = await prisma.$transaction(async (tx) => {
      const applied = await applyDataIntegrityAction(tx, input.issueId, input.action)
      const { issue, beforeData, afterData } = applied

      await createAuditLog(tx, auditContext, {
        action: input.action,
        entityType: issue.entityType,
        entityId: issue.entityId,
        entityLabel: issue.entityLabel,
        beforeData,
        afterData,
        note: input.action === 'DELETE_BOM_ITEM'
          ? `通过数据关系检查工具删除错误记录；问题类型 ${issue.type}`
          : `通过数据关系检查工具处理；问题类型 ${issue.type}；数值未换算`,
      })

      return applied.issue
    })

    return NextResponse.json({
      data: { issueId: result.id, action: input.action },
      message: actionMessages[input.action],
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Repair data integrity error:', error)
    return NextResponse.json({ error: '数据关系处理失败，数据未修改' }, { status: 500 })
  }
}
