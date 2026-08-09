import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { updateMaterialInSchema } from '@/modules/receiving/contracts/material-in-schema'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { getMaterialInDetail, updateManagedMaterialIn } from '@/modules/receiving/server/material-in-detail-service'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getMaterialInDetail(params.id) })
  } catch (error) {
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get material-in error:', error)
    return NextResponse.json({ error: '获取来料单详情失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied
    const { current, updated } = await updateManagedMaterialIn(params.id, updateMaterialInSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'MATERIAL_IN', entityId: updated.id,
      entityLabel: updated.inboundNo, beforeData: current, afterData: updated,
    })
    return NextResponse.json({ data: updated, message: '来料单已修改' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Update material-in error:', error)
    return NextResponse.json({ error: '修改来料单失败' }, { status: 500 })
  }
}
