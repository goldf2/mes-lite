import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { getEffectivePermissionMap, hasResourcePermission, requireResourcePermission } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { archiveModelSchema, purgeArchivedRecordSchema } from '@/modules/operations-tools/contracts/maintenance'
import { archiveModelActionsByPermissions, archiveModelsAllowedByPermissions, archiveResourceByModel } from '@/modules/operations-tools/domain/archive-resource-policy'
import { ArchivedRecordPurgeError } from '@/modules/operations-tools/server/archived-record-purge-service'
import { purgeArchivedRecordAndFiles } from '@/modules/operations-tools/server/archived-record-command-service'
import { listArchivedRecords } from '@/modules/operations-tools/server/maintenance-query-service'
const forbidden = () => NextResponse.json({ error: '无权限' }, { status: 403 })
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('archive', 'read')
    if (denied) return denied
    const rawModel = req.nextUrl.searchParams.get('model') || 'all'
    const model = rawModel === 'all' ? 'all' : archiveModelSchema.parse(rawModel)
    const operator = await getCurrentOperator()
    if (!operator) return forbidden()
    const permissions = await getEffectivePermissionMap(operator)
    const allowedModels = archiveModelsAllowedByPermissions(permissions, 'read')
    if (model !== 'all' && !allowedModels.includes(model)) return forbidden()
    const records = await listArchivedRecords(model, allowedModels, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: allowedModels.length > 0
      ? { ...records, modelActions: archiveModelActionsByPermissions(permissions, allowedModels) }
      : records })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get archived records error:', error)
    return NextResponse.json({ error: '获取归档记录失败' }, { status: 500 })
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('archive', 'delete')
    if (denied) return denied
    const input = purgeArchivedRecordSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator || !(await hasResourcePermission(operator, archiveResourceByModel[input.model], 'delete'))) return forbidden()
    const scope = await loadEffectiveDataScope(operator)
    const { result, fileCleanupFailed } = await purgeArchivedRecordAndFiles(input.model, input.id, scope)
    await writeAuditLog(req, {
      action: 'PURGE', entityType: result.entityType, entityId: result.id, entityLabel: result.entityLabel,
      beforeData: result.snapshot, note: '从归档记录永久删除；此操作不可恢复',
    })
    return NextResponse.json({ message: fileCleanupFailed
      ? '归档记录已永久删除，但附件文件目录清理失败，请检查服务器存储'
      : '归档记录已永久删除', fileCleanupFailed })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof ArchivedRecordPurgeError) return NextResponse.json({
      error: error.blockers.length ? `${error.message}：${error.blockers.join('；')}` : error.message,
      blockers: error.blockers,
    }, { status: error.status })
    console.error('Purge archived record error:', error); return NextResponse.json({ error: '永久删除归档记录失败' }, { status: 500 })
  }
}
