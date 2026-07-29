import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied

    const before = await prisma.scanCountSession.findUnique({ where: { id: params.id } })
    if (!before) return NextResponse.json({ error: '扫码会话不存在' }, { status: 404 })
    if (before.status !== 'OPEN') return NextResponse.json({ error: '扫码会话已结束' }, { status: 409 })
    if (Math.abs(before.countedQty - before.expectedQty) > 0.000001) {
      return NextResponse.json({ error: '扫码数量与发货数量不一致，不能完成计数' }, { status: 409 })
    }

    const session = await prisma.scanCountSession.update({
      where: { id: before.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
    })
    await writeAuditLog(req, {
      action: 'COMPLETE',
      entityType: 'SCAN_COUNT_SESSION',
      entityId: session.id,
      entityLabel: session.sessionNo,
      beforeData: before,
      afterData: session,
    })
    return NextResponse.json({ data: session, message: '扫码计数已完成' })
  } catch (error) {
    console.error('Complete scan session error:', error)
    return NextResponse.json({ error: '完成扫码计数失败' }, { status: 500 })
  }
}
