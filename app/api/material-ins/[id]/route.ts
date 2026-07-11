import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

// GET: 来料单详情
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'read')
    if (denied) return denied

    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({
      where: { id },
      include: {
        supplier: true,
        material: true,
      },
    })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    return NextResponse.json({ data: materialIn })
  } catch (error) {
    console.error('Get material-in error:', error)
    return NextResponse.json({ error: '获取来料单详情失败' }, { status: 500 })
  }
}
