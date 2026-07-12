import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materials', 'delete')
    if (denied) return denied

    const material = await prisma.material.findUnique({ where: { id: params.id } })
    if (!material || material.deletedAt) {
      return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })
    }

    const archived = await prisma.material.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'MATERIAL',
      entityId: archived.id,
      entityLabel: archived.code,
      beforeData: material,
      afterData: archived,
    })

    return NextResponse.json({ data: archived, message: '物料已归档' })
  } catch (error) {
    console.error('Archive material error:', error)
    return NextResponse.json({ error: '归档物料失败' }, { status: 500 })
  }
}
