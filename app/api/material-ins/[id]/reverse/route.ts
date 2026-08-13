import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { reverseMaterialInSchema } from '@/modules/receiving/contracts/material-in-schema'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { reverseManagedMaterialIn } from '@/modules/receiving/server/material-in-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied
    const input = reverseMaterialInSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { current, updated } = await reverseManagedMaterialIn(params.id, input, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'REVERSE', entityType: 'MATERIAL_IN', entityId: updated.id,
      entityLabel: updated.inboundNo, beforeData: current, afterData: updated, note: input.reason,
    })
    return NextResponse.json({ data: updated, message: '来料单已红冲' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reverse material-in error:', error)
    return NextResponse.json({ error: '来料单红冲失败' }, { status: 500 })
  }
}
