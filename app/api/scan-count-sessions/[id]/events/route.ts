import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { getAuditContext } from '@/lib/audit'
import { recordScanEventSchema } from '@/modules/operations-tools/contracts/scan-print'
import { ScanPrintServiceError } from '@/modules/operations-tools/domain/scan-print-errors'
import { recordScanEvent, undoLastMatchedScan } from '@/modules/operations-tools/server/scan-session-command-service'

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: '扫码参数错误', details: error.errors }, { status: 400 })
  if (error instanceof ScanPrintServiceError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied
    return NextResponse.json(await recordScanEvent(
      params.id,
      recordScanEventSchema.parse(await req.json()),
      await getAuditContext(req),
    ))
  } catch (error) {
    return errorResponse(error, '记录扫码失败')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied
    return NextResponse.json({ data: await undoLastMatchedScan(params.id, await getAuditContext(req)) })
  } catch (error) {
    return errorResponse(error, '撤销扫码失败')
  }
}
