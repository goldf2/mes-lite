import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { BomDomainError } from '@/modules/bom/domain/bom-errors'
import { obsoleteBomVersion } from '@/modules/bom/server/bom-lifecycle-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('bomCost', 'delete')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const saved = await obsoleteBomVersion(params.id, operator?.id)
    await writeAuditLog(req, {
      action: 'OBSOLETE', entityType: 'BOM', entityId: saved.id,
      entityLabel: `${saved.name} ${saved.version}`, afterData: saved,
    })
    return NextResponse.json({ data: saved, message: `BOM ${saved.version} 已作废，历史订单不受影响` })
  } catch (error) {
    if (error instanceof BomDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Obsolete BOM error:', error)
    return NextResponse.json({ error: '作废 BOM 失败' }, { status: 500 })
  }
}
