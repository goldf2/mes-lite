import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { archiveModelSchema, purgeArchivedRecordSchema } from '@/modules/operations-tools/contracts/maintenance'
import { ArchivedRecordPurgeError } from '@/modules/operations-tools/server/archived-record-purge-service'
import { purgeArchivedRecordAndFiles } from '@/modules/operations-tools/server/archived-record-command-service'
import { listArchivedRecords } from '@/modules/operations-tools/server/maintenance-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('archive', 'read')
    if (denied) return denied
    const rawModel = req.nextUrl.searchParams.get('model') || 'all'
    const model = rawModel === 'all' ? 'all' : archiveModelSchema.parse(rawModel)
    return NextResponse.json({ data: await listArchivedRecords(model) })
  } catch (error) {
    console.error('Get archived records error:', error)
    return NextResponse.json({ error: '获取归档记录失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('archive', 'delete')
    if (denied) return denied
    const input = purgeArchivedRecordSchema.parse(await req.json())
    const { result, fileCleanupFailed } = await purgeArchivedRecordAndFiles(input.model, input.id)
    await writeAuditLog(req, {
      action: 'PURGE', entityType: result.entityType, entityId: result.id, entityLabel: result.entityLabel,
      beforeData: result.snapshot, note: '从归档记录永久删除；此操作不可恢复',
    })
    return NextResponse.json({
      message: fileCleanupFailed ? '归档记录已永久删除，但附件文件目录清理失败，请检查服务器存储' : '归档记录已永久删除',
      fileCleanupFailed,
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof ArchivedRecordPurgeError) return NextResponse.json({
      error: error.blockers.length ? `${error.message}：${error.blockers.join('；')}` : error.message,
      blockers: error.blockers,
    }, { status: error.status })
    console.error('Purge archived record error:', error)
    return NextResponse.json({ error: '永久删除归档记录失败' }, { status: 500 })
  }
}
