import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { BomDomainError } from '@/modules/bom/domain/bom-errors'
import { releaseBomVersion } from '@/modules/bom/server/bom-lifecycle-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const saved = await releaseBomVersion(params.id, operator?.id)
    await writeAuditLog(req, {
      action: 'RELEASE', entityType: 'BOM', entityId: saved.id,
      entityLabel: `${saved.name} ${saved.version}`, afterData: saved,
    })
    return NextResponse.json({ data: saved, message: `BOM ${saved.version} 已发布并设为默认版本` })
  } catch (error) {
    if (error instanceof BomDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Release BOM error:', error)
    return NextResponse.json({ error: '发布 BOM 失败' }, { status: 500 })
  }
}
