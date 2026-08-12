import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { deleteProductionOrderActualDraft } from '@/modules/production/server/production-order-actual-service'

export async function DELETE(req: NextRequest, { params }: { params: { id: string; actualId: string } }) {
  try {
    const denied = await requireResourcePermission('productionActualEntry', 'delete')
    if (denied) return denied
    const actual = await deleteProductionOrderActualDraft(params.id, params.actualId)
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
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Delete production order actual error:', error)
    return NextResponse.json({ error: '删除班后生产实绩草稿失败' }, { status: 500 })
  }
}
