import { createAuditLog, getAuditContext } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import type { z } from 'zod'
import type { dataIntegrityActionSchema } from '../contracts/maintenance'
import { applyDataIntegrityAction, type DataIntegrityActionKey } from './data-integrity-service'

export const dataIntegrityActionMessages: Record<DataIntegrityActionKey, string> = {
  SYNC_BOM_ITEM_UNIT: 'BOM 原料单位已按当前主库存单位修复',
  DELETE_BOM_ITEM: '错误 BOM 明细已删除',
  DELETE_ORPHAN_STOCK: '孤立的零余额库存记录已清理',
  SYNC_BOM_OUTPUT_UNIT: 'BOM 产出单位已同步',
  SYNC_PRODUCT_UNIT: '兼容产品单位已同步',
  CLEAR_STALE_BOM_ITEM_REF: '生产日报的失效 BOM 明细指针已清理',
}

export async function executeDataIntegrityAction(
  input: z.infer<typeof dataIntegrityActionSchema>,
  auditContext: Awaited<ReturnType<typeof getAuditContext>>,
) {
  const destructive = input.action === 'DELETE_BOM_ITEM' || input.action === 'DELETE_ORPHAN_STOCK'
  if (destructive && input.confirmation !== 'DELETE_ERROR_DATA') throw new Error('缺少删除确认')
  const issue = await prisma.$transaction(async (tx) => {
    const applied = await applyDataIntegrityAction(tx, input.issueId, input.action)
    await createAuditLog(tx, auditContext, {
      action: input.action,
      entityType: applied.issue.entityType,
      entityId: applied.issue.entityId,
      entityLabel: applied.issue.entityLabel,
      beforeData: applied.beforeData,
      afterData: applied.afterData,
      note: destructive
        ? `通过数据维护工具删除经事务复检的安全清理记录；问题类型 ${applied.issue.type}`
        : `通过数据关系检查工具处理；问题类型 ${applied.issue.type}；数值未换算`,
    })
    return applied.issue
  })
  return { issue, destructive }
}
