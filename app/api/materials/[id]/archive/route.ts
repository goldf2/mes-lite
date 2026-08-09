import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { archiveMaterialRecord, MaterialArchiveError } from '@/modules/materials/server/material-command-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materials', 'delete')
    if (denied) return denied
    const { before, material } = await archiveMaterialRecord(params.id)
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'MATERIAL', entityId: material.id,
      entityLabel: material.code, beforeData: before, afterData: material,
    })
    return NextResponse.json({ data: material, message: '物料已归档' })
  } catch (error) {
    if (error instanceof MaterialArchiveError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Archive material error:', error)
    return NextResponse.json({ error: '归档物料失败' }, { status: 500 })
  }
}
