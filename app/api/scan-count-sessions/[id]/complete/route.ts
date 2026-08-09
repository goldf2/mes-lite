import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { ScanPrintServiceError } from '@/modules/operations-tools/domain/scan-print-errors'
import { completeScanSession } from '@/modules/operations-tools/server/scan-session-command-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied
    const { before, data } = await completeScanSession(params.id)
    await writeAuditLog(req, {
      action: 'COMPLETE', entityType: 'SCAN_COUNT_SESSION', entityId: data.id,
      entityLabel: data.sessionNo, beforeData: before, afterData: data,
    })
    return NextResponse.json({ data, message: '扫码计数已完成' })
  } catch (error) {
    if (error instanceof ScanPrintServiceError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Complete scan session error:', error)
    return NextResponse.json({ error: '完成扫码计数失败' }, { status: 500 })
  }
}
