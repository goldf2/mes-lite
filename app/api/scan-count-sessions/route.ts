import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { createScanSessionSchema } from '@/modules/operations-tools/contracts/scan-print'
import { createScanSession } from '@/modules/operations-tools/server/scan-session-command-service'
import { listScanSessions } from '@/modules/operations-tools/server/scan-session-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listScanSessions({
      referenceId: req.nextUrl.searchParams.get('referenceId'),
      purpose: req.nextUrl.searchParams.get('purpose'),
    }) })
  } catch (error) {
    console.error('Get scan sessions error:', error)
    return NextResponse.json({ error: '获取扫码会话失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const session = await createScanSession(createScanSessionSchema.parse(await req.json()), operator?.name || null)
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'SCAN_COUNT_SESSION', entityId: session.id,
      entityLabel: session.name || session.sessionNo, afterData: session,
    })
    return NextResponse.json({ data: session }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create scan session error:', error)
    return NextResponse.json({ error: '创建扫码会话失败' }, { status: 500 })
  }
}
