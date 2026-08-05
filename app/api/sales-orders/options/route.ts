import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('salesOrder', 'read')
    if (denied) return denied

    const [customers, materials] = await Promise.all([
      prisma.customer.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, contact: true, phone: true, address: true },
      }),
      prisma.material.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true },
      }),
    ])
    return NextResponse.json({ customers, materials })
  } catch (error) {
    console.error('Get sales order options error:', error)
    return NextResponse.json({ error: '获取销售订单选项失败' }, { status: 500 })
  }
}
