import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

// PATCH: 拒收
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied

    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({ where: { id } })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    if (materialIn.status !== 'PENDING') {
      return NextResponse.json({ error: '来料单状态不是待收货，无法拒收' }, { status: 400 })
    }

    await prisma.materialIn.update({
      where: { id },
      data: { status: 'REJECTED' },
    })

    return NextResponse.json({ success: true, message: '拒收成功' })
  } catch (error) {
    console.error('Reject material-in error:', error)
    return NextResponse.json({ error: '拒收失败' }, { status: 500 })
  }
}
