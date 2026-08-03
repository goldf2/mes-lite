import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; actualId: string } },
) {
  try {
    const denied = await requireResourcePermission('orders', 'delete')
    if (denied) return denied
    const actual = await prisma.productionOrderActual.findFirst({
      where: { id: params.actualId, orderId: params.id },
      include: { inputs: true, outputs: true },
    })
    if (!actual) return NextResponse.json({ error: '班后生产实绩不存在' }, { status: 404 })
    if (actual.status !== 'DRAFT') return NextResponse.json({ error: '只有草稿实绩可以删除；已确认实绩请使用冲销' }, { status: 400 })
    await prisma.productionOrderActual.delete({ where: { id: actual.id } })
    await writeAuditLog(req, {
      action: 'DELETE',
      entityType: 'PRODUCTION_ORDER_ACTUAL',
      entityId: actual.id,
      entityLabel: actual.actualNo,
      beforeData: actual,
      note: '删除未过账的班后生产实绩草稿',
    })
    return NextResponse.json({ success: true, message: '班后生产实绩草稿已删除' })
  } catch (error) {
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '删除班后生产实绩草稿失败' }, { status: 500 })
  }
}
